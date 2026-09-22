/**
 * Seed script (§93). Run with `pnpm --filter @kiro/api seed`.
 *
 * Covers: super-admin user, system_settings, Ukraine geography (delegates to
 * import-ukraine-geo.ts, §94), initial categories (§38), and listing credit
 * packages (§50). Purchasing a package is still Phase 9 (no payment
 * provider wired up) — this just seeds the prices so they exist for the
 * free-credits/publish flow to reference and are never hardcoded client-side.
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { SYSTEM_SETTING_DEFAULTS } from "@kiro/types";
import { importUkraineGeography } from "./import-ukraine-geo";
import categoriesData from "./seed-data/categories.json";

const prisma = new PrismaClient();

interface CategorySeed {
  slug: string;
  nameUk: string;
  nameEn: string;
  icon?: string;
  children?: CategorySeed[];
}

async function main() {
  await seedSuperAdmin();
  await seedSystemSettings();
  await seedGeography();
  await seedCategories();
  await seedCreditPackages();
}

async function seedSuperAdmin() {
  // §93/§117 — never hardcode the owner's email in git; it comes from env only.
  const email = process.env.INITIAL_SUPERADMIN_EMAIL;
  if (!email) {
    console.warn(
      "[seed] INITIAL_SUPERADMIN_EMAIL is not set — skipping super-admin creation. " +
        "Set it in apps/api/.env before seeding a real environment.",
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Super-admin ${email} already exists — skipping.`);
    return;
  }

  // Random one-time password — the owner resets it via "forgot password" on
  // first login rather than us ever writing a real password into the repo.
  const temporaryPassword = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Kiro Super Admin",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      preferences: { create: {} },
    },
  });

  console.log(`[seed] Created super-admin ${email}.`);
  console.log(`[seed] Temporary password (use "forgot password" instead if unsure): ${temporaryPassword}`);
}

async function seedSystemSettings() {
  for (const [key, value] of Object.entries(SYSTEM_SETTING_DEFAULTS)) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, valueJson: value as never },
      update: {},
    });
  }
  console.log(`[seed] Ensured ${Object.keys(SYSTEM_SETTING_DEFAULTS).length} system_settings rows.`);
}

async function seedGeography() {
  const result = await importUkraineGeography(prisma);
  console.log(
    `[seed] Geography: ${result.regions} regions, ${result.cities} cities (+${result.citiesCreated} new), ` +
      `${result.districts} districts (+${result.districtsCreated} new).`,
  );
}

async function seedCategories() {
  let created = 0;
  let sortOrder = 0;

  for (const category of categoriesData as CategorySeed[]) {
    created += await upsertCategory(category, null, sortOrder++);
  }

  console.log(`[seed] Categories: ${await prisma.category.count()} total (+${created} new).`);
}

async function upsertCategory(
  data: CategorySeed,
  parentId: string | null,
  sortOrder: number,
): Promise<number> {
  const before = await prisma.category.findUnique({ where: { slug: data.slug } });
  const category = await prisma.category.upsert({
    where: { slug: data.slug },
    create: {
      slug: data.slug,
      nameUk: data.nameUk,
      nameEn: data.nameEn,
      icon: data.icon,
      parentId,
      sortOrder,
      source: "SYSTEM",
    },
    update: { nameUk: data.nameUk, nameEn: data.nameEn, icon: data.icon, sortOrder },
  });

  let created = before ? 0 : 1;
  let childSortOrder = 0;
  for (const child of data.children ?? []) {
    created += await upsertCategory(child, category.id, childSortOrder++);
  }
  return created;
}

async function seedCreditPackages() {
  const packages = [
    { name: "1 publication", credits: 1, price: 199, sortOrder: 0 },
    { name: "5 publications", credits: 5, price: 799, sortOrder: 1 },
    { name: "10 publications", credits: 10, price: 1499, sortOrder: 2 },
  ];

  for (const pkg of packages) {
    await prisma.creditPackage.upsert({
      where: { name: pkg.name },
      create: { ...pkg, currency: "UAH" },
      update: { credits: pkg.credits, price: pkg.price, sortOrder: pkg.sortOrder },
    });
  }
  console.log(`[seed] Credit packages: ${await prisma.creditPackage.count()} total.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
