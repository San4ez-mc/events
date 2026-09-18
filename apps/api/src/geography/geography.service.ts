import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

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
}
