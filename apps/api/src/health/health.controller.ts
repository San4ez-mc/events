import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * §109 — liveness vs readiness split:
 * /health       liveness: process is up, nothing else checked.
 * /health/ready readiness: dependencies (DB, and later storage/worker) are reachable.
 */
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiExcludeEndpoint()
  liveness() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  @ApiExcludeEndpoint()
  async readiness(@Res() res: Response) {
    const dbHealthy = await this.prisma.isHealthy();
    const checks = {
      database: dbHealthy,
      // TODO(Phase 1+): storage (MinIO/S3 ping), worker (pg-boss heartbeat).
    };
    const healthy = Object.values(checks).every(Boolean);
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: healthy ? "ok" : "degraded",
      checks,
    });
  }
}
