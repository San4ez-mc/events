/**
 * Ukrainian geography importer (§94). Not a runtime dependency — this is a
 * one-off data-loading routine, invoked either directly:
 *
 *   pnpm --filter @kiro/api geo:import
 *
 * or as part of the general seed script (§93 wants seed.ts to include
 * "Ukraine city/region data"; this module is where that data-loading logic
 * actually lives, kept separate so it stays independently re-runnable after
 * editing geo-data/ukraine.json without re-running the rest of the seed).
 *
 * Idempotent: regions are upserted on (countryCode, nameUk), cities on
 * slug, districts on (cityId, nameUk). Safe to re-run — existing rows are
 * updated in place, new ones inserted with source=SYSTEM.
 */
import { PrismaClient } from "@prisma/client";
import geoData from "./geo-data/ukraine.json";

interface CityData {
  nameUk: string;
  nameEn: string;
  slug: string;
  lat: number;
  lng: number;
  population?: number;
  districts?: string[];
}

interface RegionData {
  nameUk: string;
  nameEn: string;
  cities: CityData[];
}

export async function importUkraineGeography(
  prisma: PrismaClient,
): Promise<{ regions: number; cities: number; citiesCreated: number; districts: number; districtsCreated: number }> {
  const { countryCode, regions } = geoData as { countryCode: string; regions: RegionData[] };

  let citiesCreated = 0;
  let districtsCreated = 0;

  for (const regionData of regions) {
    const region = await prisma.region.upsert({
      where: { countryCode_nameUk: { countryCode, nameUk: regionData.nameUk } },
      create: { countryCode, nameUk: regionData.nameUk, nameEn: regionData.nameEn },
      update: { nameEn: regionData.nameEn },
    });

    for (const cityData of regionData.cities) {
      const cityBefore = await prisma.city.findUnique({ where: { slug: cityData.slug } });
      const city = await prisma.city.upsert({
        where: { slug: cityData.slug },
        create: {
          regionId: region.id,
          nameUk: cityData.nameUk,
          nameEn: cityData.nameEn,
          slug: cityData.slug,
          latitude: cityData.lat,
          longitude: cityData.lng,
          population: cityData.population,
        },
        update: { nameEn: cityData.nameEn, population: cityData.population },
      });
      if (!cityBefore) citiesCreated++;

      for (const districtName of cityData.districts ?? []) {
        const districtBefore = await prisma.district.findUnique({
          where: { cityId_nameUk: { cityId: city.id, nameUk: districtName } },
        });
        await prisma.district.upsert({
          where: { cityId_nameUk: { cityId: city.id, nameUk: districtName } },
          create: { cityId: city.id, nameUk: districtName, status: "ACTIVE", source: "SYSTEM" },
          update: {},
        });
        if (!districtBefore) districtsCreated++;
      }
    }
  }

  return {
    regions: await prisma.region.count(),
    cities: await prisma.city.count(),
    citiesCreated,
    districts: await prisma.district.count(),
    districtsCreated,
  };
}

async function runStandalone() {
  const prisma = new PrismaClient();
  try {
    const result = await importUkraineGeography(prisma);
    console.log(
      `[import-ukraine-geo] regions: ${result.regions}, cities: ${result.cities} (+${result.citiesCreated} new), ` +
        `districts: ${result.districts} (+${result.districtsCreated} new)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runStandalone().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
