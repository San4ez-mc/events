import { randomUUID } from "node:crypto";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.validation";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { MailModule } from "./mail/mail.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RolesGuard } from "./auth/guards/roles.guard";
import { UsersModule } from "./users/users.module";
import { HealthModule } from "./health/health.module";
import { GeographyModule } from "./geography/geography.module";
import { CategoriesModule } from "./categories/categories.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        genReqId: (req) =>
          typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : randomUUID(),
        // Never log secrets (§90).
        redact: ["req.headers.authorization", "req.headers.cookie"],
        transport:
          process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
      },
    }),
    // §87 — global default; individual auth endpoints layer stricter @Throttle() limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    HealthModule,
    GeographyModule,
    CategoriesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Auth-by-default: every route requires a valid JWT unless annotated @Public() (§63).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Nest 11 / path-to-regexp v7 wants named wildcard params, not bare "*".
    consumer.apply(RequestIdMiddleware).forRoutes("*path");
  }
}
