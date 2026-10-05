import type { INestApplication } from "@nestjs/common";
import { ValidationPipe, type ValidationError } from "@nestjs/common";
import { ApiException } from "./common/exceptions/api.exception";
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
      // `_` keeps the human-readable messages (existing clients read it); every invalid field also gets its own key
      // (nested ones as "links.0.url") holding the failed rules (e.g. ["isUrl"]) so a form can mark that exact input.
      exceptionFactory: (errors: ValidationError[]) => {
        const details: Record<string, string[]> = { _: [] };
        const walk = (list: ValidationError[], prefix: string) => {
          for (const e of list) {
            const path = prefix ? `${prefix}.${e.property}` : e.property;
            if (e.constraints) {
              details._!.push(...Object.values(e.constraints));
              details[path] = Object.keys(e.constraints);
            }
            if (e.children?.length) walk(e.children, path);
          }
        };
        walk(errors, "");
        return new ApiException("VALIDATION_ERROR", "Validation failed", 400, details);
      },
    }),
  );
}
