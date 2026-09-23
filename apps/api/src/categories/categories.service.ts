import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { slugifyUnique } from "../common/utils/slugify";
import { MAX_CATEGORY_DEPTH } from "@kiro/config";
import { AuditLogService } from "../audit/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateCategoryDto } from "./dto/create-category.dto";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Public tree: top-level categories with their children nested (§16). */
  async listTree() {
    const categories = await this.prisma.category.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    const byParent = new Map<string | null, typeof categories>();
    for (const category of categories) {
      const key = category.parentId;
      byParent.set(key, [...(byParent.get(key) ?? []), category]);
    }

    const attachChildren = (parentId: string | null): unknown[] =>
      (byParent.get(parentId) ?? []).map((category) => ({
        ...category,
        children: attachChildren(category.id),
      }));

    return attachChildren(null);
  }

  /**
   * User-created categories (§16, §38) start PENDING — an admin approves,
   * renames, reparents, merges, or hides them (Phase 10 admin endpoints).
   */
  async create(userId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.status !== "ACTIVE") {
        throw new ApiException("NOT_FOUND", "Parent category not found", 404);
      }
      // Max tree depth is 2 (§16): a category with its own parent is already
      // depth 1, so it can't itself be used as a parent (that would be depth 2
      // children, i.e. 3 levels).
      if (parent.parentId) {
        throw new ApiException(
          "VALIDATION_ERROR",
          `Category tree depth cannot exceed ${MAX_CATEGORY_DEPTH}`,
          400,
        );
      }
    }

    let slug = slugifyUnique(dto.nameUk);
    // Vanishingly unlikely, but a slug collision is a real constraint we must
    // not 500 on — regenerate once rather than trusting randomness blindly.
    if (await this.prisma.category.findUnique({ where: { slug } })) {
      slug = slugifyUnique(dto.nameUk);
    }

    return this.prisma.category.create({
      data: {
        slug,
        nameUk: dto.nameUk,
        nameEn: dto.nameEn ?? dto.nameUk,
        parentId: dto.parentId,
        status: "PENDING",
        source: "USER_CREATED",
        createdByUserId: userId,
      },
    });
  }

  /**
   * §76 — merges `sourceId` into `targetCategoryId`: every event/subscription
   * pointing at the source is repointed to the target, the source row is
   * kept (never hard-deleted — it may still be referenced historically) and
   * marked MERGED with `mergedIntoCategoryId` set, and affected event owners
   * are notified.
   */
  async merge(adminId: string, sourceId: string, targetCategoryId: string) {
    if (sourceId === targetCategoryId) {
      throw new ApiException("VALIDATION_ERROR", "A category can't be merged into itself", 400);
    }

    const [source, target] = await Promise.all([
      this.prisma.category.findUnique({ where: { id: sourceId } }),
      this.prisma.category.findUnique({ where: { id: targetCategoryId } }),
    ]);
    if (!source) throw new ResourceNotFoundException("Category not found");
    if (!target || target.status === "MERGED") {
      throw new ApiException("VALIDATION_ERROR", "Target category not found or itself merged", 400);
    }

    const affectedEvents = await this.prisma.event.findMany({
      where: { categoryId: sourceId },
      select: { id: true, ownerId: true, title: true },
      distinct: ["ownerId"],
    });

    const merged = await this.prisma.$transaction(async (tx) => {
      await tx.event.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetCategoryId } });
      await tx.subscription.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetCategoryId },
      });
      return tx.category.update({
        where: { id: sourceId },
        data: { status: "MERGED", mergedIntoCategoryId: targetCategoryId },
      });
    });

    await this.auditLog.record({
      actorUserId: adminId,
      action: "CATEGORY_MERGE",
      entityType: "Category",
      entityId: sourceId,
      before: { status: source.status, mergedIntoCategoryId: source.mergedIntoCategoryId },
      after: { status: "MERGED", mergedIntoCategoryId: targetCategoryId },
    });

    await Promise.all(
      affectedEvents.map((event) =>
        this.notifications.create({
          userId: event.ownerId,
          type: "CATEGORY_MERGED",
          title: "A category you used was merged",
          body: `"${source.nameUk}" was merged into "${target.nameUk}". Your event "${event.title}" now uses the new category.`,
          payloadJson: { sourceCategoryId: sourceId, targetCategoryId },
        }),
      ),
    );

    return merged;
  }
}
