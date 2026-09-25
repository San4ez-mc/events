import { Injectable } from "@nestjs/common";
import { FEATURE_FLAG_KEYS, FEATURE_FLAG_DEFAULTS, type FeatureFlagKey } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";

const CACHE_MS = 10_000;

/** §95 — runtime feature flags stored in `system_settings` (key `flag.<name>`), cached for a few seconds. */
@Injectable()
export class FeatureFlagsService {
  private cache: { at: number; values: Record<FeatureFlagKey, boolean> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<Record<FeatureFlagKey, boolean>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.values;
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: FEATURE_FLAG_KEYS.map((k) => `flag.${k}`) } } });
    const values = { ...FEATURE_FLAG_DEFAULTS } as Record<FeatureFlagKey, boolean>;
    for (const row of rows) {
      const name = row.key.slice("flag.".length) as FeatureFlagKey;
      if (typeof row.valueJson === "boolean") values[name] = row.valueJson;
    }
    this.cache = { at: Date.now(), values };
    return values;
  }

  async isEnabled(flag: FeatureFlagKey): Promise<boolean> {
    return (await this.all())[flag];
  }

  /** Throws 403 FEATURE_DISABLED when the flag is off. */
  async assertEnabled(flag: FeatureFlagKey): Promise<void> {
    if (!(await this.isEnabled(flag))) throw new ApiException("FEATURE_DISABLED", `Feature "${flag}" is currently disabled`, 403);
  }

  async set(flag: FeatureFlagKey, enabled: boolean): Promise<Record<FeatureFlagKey, boolean>> {
    await this.prisma.systemSetting.upsert({
      where: { key: `flag.${flag}` },
      create: { key: `flag.${flag}`, valueJson: enabled },
      update: { valueJson: enabled },
    });
    this.cache = null;
    return this.all();
  }
}
