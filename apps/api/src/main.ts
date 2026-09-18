import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { EnvConfig } from "./config/env.validation";
import { API_PREFIX } from "@kiro/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<EnvConfig, true>);

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigins = configService
    .get("CORS_ORIGINS", { infer: true })
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ""));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

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
  // eslint-disable-next-line no-console -- logger may not be wired yet if bootstrap failed early
  console.error("Fatal error during bootstrap:", error);
  process.exit(1);
});
