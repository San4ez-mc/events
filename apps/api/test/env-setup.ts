/**
 * Loads env vars for e2e tests before any test file runs. Prefers
 * `.env.test` (points at kiro_test) and falls back to `.env` (kiro_dev) so
 * this also works out of the box right after `pnpm --filter @kiro/api dev`
 * setup — CI instead sets these directly via the workflow's `env:` block, so
 * this is a no-op there (dotenv never overwrites an already-set var).
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

const testEnvPath = join(__dirname, "..", ".env.test");
const defaultEnvPath = join(__dirname, "..", ".env");

config({ path: existsSync(testEnvPath) ? testEnvPath : defaultEnvPath });
