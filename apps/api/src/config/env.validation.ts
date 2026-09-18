import { z } from "zod";

/**
 * Validates process.env at boot. The app refuses to start rather than run
 * with a missing secret (§107: required env vars).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  APP_URL: z.string().url(),
  API_URL: z.string().url(),

  CORS_ORIGINS: z.string().default(""),

  GOOGLE_MAPS_API_KEY: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_PUBLIC_URL: z.string().optional(),

  INITIAL_SUPERADMIN_EMAIL: z.string().email().optional(),

  // Optional — falls back to logging emails instead of sending (dev/staging default).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("Kiro <no-reply@kiro.local>"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  // dotenv turns `FOO=` into an empty string, not "unset" — treat empty
  // strings as absent so `.optional()` fields behave as documented instead
  // of failing coercion (e.g. Number("") === 0, which then fails .positive()).
  const normalized = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // Fail fast and loud — a misconfigured prod deploy should never boot.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
