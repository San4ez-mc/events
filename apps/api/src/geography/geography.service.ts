import { Injectable } from "@nestjs/common";
import type { SuggestDistrictDto } from "./dto/suggest-district.dto";
import type { UpdateDistrictDto } from "../admin/dto/update-district.dto";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { AuditLogService } from "../audit/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class GeographyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  listRegions() {
    return this.prisma.region.findMany({
      where: { status: "ACTIVE" },
      orderBy: { nameUk: "asc" },
    });
  }

  listCities(params: { regionId?: string; search?: string }) {
    return this.prisma.city.findMany({
      where: {
        status: "ACTIVE",
        regionId: params.regionId,
        ...(params.search
          ? {
              OR: [
                { nameUk: { contains: params.search, mode: "insensitive" } },
                { nameEn: { contains: params.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nameUk: "asc" },
    });
  }

  async getCityBySlug(slug: string) {
    const city = await this.prisma.city.findUnique({ where: { slug } });
    if (!city) throw new ResourceNotFoundException("City not found");
    return city;
  }

  /**
   * Districts include both official (SYSTEM) and community-created ones
   * (§37) — active only; merged/pending districts are excluded from this
   * public listing (pending ones aren't approved yet, merged ones point
   * elsewhere).
   */
  listDistricts(cityId: string) {
    return this.prisma.district.findMany({
      where: { cityId, status: "ACTIVE" },
      orderBy: { nameUk: "asc" },
    });
  }

  /** §37 — community-suggested district: PENDING (invisible) until approved by an admin. */
  async suggestDistrict(userId: string, dto: SuggestDistrictDto) {
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
    if (!city || city.status !== "ACTIVE") throw new ResourceNotFoundException("City not found");
    const existing = await this.prisma.district.findUnique({ where: { cityId_nameUk: { cityId: dto.cityId, nameUk: dto.nameUk.trim() } } });
    if (existing) return existing; // idempotent: same name -> same row, whatever its status
    return this.prisma.district.create({
      data: {
        cityId: dto.cityId,
        nameUk: dto.nameUk.trim(),
        nameEn: dto.nameEn?.trim() || null,
        status: "PENDING",
        source: "USER_CREATED",
        createdByUserId: userId,
      },
    });
  }

  listAllDistrictsForAdmin(cityId?: string) {
    return this.prisma.district.findMany({
      where: { cityId },
      orderBy: [{ status: "asc" }, { nameUk: "asc" }],
      select: { id: true, cityId: true, nameUk: true, nameEn: true, status: true, source: true, createdAt: true },
    });
  }

  async adminUpdateDistrict(adminId: string, id: string, dto: UpdateDistrictDto, ip?: string) {
    const before = await this.prisma.district.findUnique({ where: { id } });
    if (!before) throw new ResourceNotFoundException("District not found");
    if (before.status === "MERGED") throw new ApiException("VALIDATION_ERROR", "A merged district can't be edited", 400);
    const updated = await this.prisma.district.update({ where: { id }, data: dto });
    await this.auditLog.record({
      actorUserId: adminId,
      action: dto.status && dto.status !== before.status ? `DISTRICT_${dto.status}` : "DISTRICT_UPDATE",
      entityType: "District",
      entityId: id,
      before: { nameUk: before.nameUk, nameEn: before.nameEn, status: before.status },
      after: dto,
      ip,
    });
    return updated;
  }

  /** §77 — same behavior as category merge (§76): never hard-delete, repoint events, notify owners. */
  async mergeDistrict(adminId: string, sourceId: string, targetDistrictId: string) {
    if (sourceId === targetDistrictId) {
      throw new ApiException("VALIDATION_ERROR", "A district can't be merged into itself", 400);
    }

    const [source, target] = await Promise.all([
      this.prisma.district.findUnique({ where: { id: sourceId } }),
      this.prisma.district.findUnique({ where: { id: targetDistrictId } }),
    ]);
    if (!source) throw new ResourceNotFoundException("District not found");
    if (!target || target.status === "MERGED") {
      throw new ApiException("VALIDATION_ERROR", "Target district not found or itself merged", 400);
    }
    if (source.cityId !== target.cityId) {
      throw new ApiException("VALIDATION_ERROR", "Can only merge districts within the same city", 400);
    }

    const affectedEvents = await this.prisma.event.findMany({
      where: { districtId: sourceId },
      select: { id: true, ownerId: true, title: true },
      distinct: ["ownerId"],
    });

    const merged = await this.prisma.$transaction(async (tx) => {
      await tx.event.updateMany({ where: { districtId: sourceId }, data: { districtId: targetDistrictId } });
      return tx.district.update({
        where: { id: sourceId },
        data: { status: "MERGED", mergedIntoDistrictId: targetDistrictId },
      });
    });

    await this.auditLog.record({
      actorUserId: adminId,
      action: "DISTRICT_MERGE",
      entityType: "District",
      entityId: sourceId,
      before: { status: source.status, mergedIntoDistrictId: source.mergedIntoDistrictId },
      after: { status: "MERGED", mergedIntoDistrictId: targetDistrictId },
    });

    await Promise.all(
      affectedEvents.map((event) =>
        this.notifications.create({
          userId: event.ownerId,
          type: "DISTRICT_MERGED",
          title: "A district you used was merged",
          body: `"${source.nameUk}" was merged into "${target.nameUk}". Your event "${event.title}" now uses the new district.`,
          payloadJson: { sourceDistrictId: sourceId, targetDistrictId },
        }),
      ),
    );

    return merged;
  }
}
