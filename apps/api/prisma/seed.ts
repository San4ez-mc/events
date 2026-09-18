/**
 * Seed script (§93). Run with `pnpm --filter @kiro/api seed`.
 *
 * Phase 0 scope only: super-admin user + default system_settings. Geography,
 * categories, credit packages seed data lands with their respective phases
 * (§93/§94) — do not hardcode them here ahead of the schema that needs them.
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { SYSTEM_SETTING_DEFAULTS } from "@kiro/types";

const prisma = new PrismaClient();

async function main() {
  await seedSuperAdmin();
  await seedSystemSettings();
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
