import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { EnvConfig } from "./config/env.validation";
import { API_PREFIX } from "@kiro/config";

/**
 * Shared app configuration (middleware, global prefix, validation pipe)
 * used by both main.ts and e2e tests, so tests exercise the exact same
 * request pipeline production traffic hits — no drift between "what we
 * test" and "what actually runs".
 */
export function configureApp(app: INestApplication, configService: ConfigService<EnvConfig, true>): void {
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
}
