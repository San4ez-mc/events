/* Pulls events from an outside listing site and publishes them under the "Зовнішній організатор" profile.
 *   cd /var/www/kiro/apps/api && set -a && . ./.env && set +a && node scripts/run-import.js ottry '{"dryRun":true,"include":"halloween|хелловін","to":"2026-11-02"}'
 * Sources and options: see EVENT-SOURCES.md in the repo root. Prints the report as JSON. */
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/src/app.module");
const { EventImportService } = require("../dist/src/integrations/import/event-import.service");

(async () => {
  const [source, optionsJson] = process.argv.slice(2);
  if (!source) throw new Error("usage: node scripts/run-import.js <source> ['{json options}']");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const report = await app.get(EventImportService, { strict: false }).run(source, optionsJson ? JSON.parse(optionsJson) : {});
  console.log(JSON.stringify(report, null, 2));
  await app.close();
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
