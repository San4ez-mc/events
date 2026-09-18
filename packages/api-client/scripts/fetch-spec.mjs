#!/usr/bin/env node
/**
 * Pulls the live OpenAPI spec from a running dev API and writes it to
 * ./openapi.json, which `generate` then feeds to openapi-typescript.
 *
 * Run the API (`pnpm --filter @kiro/api dev`) first.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiUrl = process.env.API_URL ?? "http://localhost:3100";
const specUrl = `${apiUrl}/docs-json`;

const res = await fetch(specUrl).catch((err) => {
  console.error(`Could not reach ${specUrl} — is the API running (pnpm --filter @kiro/api dev)?`);
  console.error(err.message);
  process.exit(1);
});

if (!res.ok) {
  console.error(`Unexpected response from ${specUrl}: ${res.status}`);
  process.exit(1);
}

const spec = await res.json();
const outPath = join(__dirname, "..", "openapi.json");
writeFileSync(outPath, JSON.stringify(spec, null, 2));
console.log(`Wrote ${outPath}`);
