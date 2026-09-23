import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { EnvConfig } from "./config/env.validation";
import { configureApp } from "./bootstrap";

async function bootstrap() {
  // rawBody: true — needed so Payments' webhook handlers (Mono/WayForPay)
  // can verify a signature computed over the exact bytes the provider sent,
  // not a re-serialized copy of the parsed body.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<EnvConfig, true>);
  configureApp(app, configService);

  const isProd = configService.get("NODE_ENV", { infer: true }) === "production";
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Kiro API")
      .setDescription("Backend API for the Kiro events platform")
      .setVersion("0.0.1")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = configService.get("PORT", { infer: true });
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error("Fatal error during bootstrap:", error);
  process.exit(1);
});
