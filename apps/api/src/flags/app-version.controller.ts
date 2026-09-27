import { Body, Controller, Get, Param, Put, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ApiException } from "../common/exceptions/api.exception";
import { AuditLogService } from "../audit/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";

const PLATFORMS = ["android", "ios"] as const;
type Platform = (typeof PLATFORMS)[number];

export interface AppVersionInfo {
  /** Newest published build number (Android versionCode / iOS buildNumber). 0 = nothing to announce. */
  latestBuild: number;
  /** Builds older than this must update before use (blocking screen). 0 = never forced. */
  minBuild: number;
  /** Human-readable version shown in the prompt, e.g. "1.2.0". */
  latestName: string;
  /** Where to send the user: Play Store page or a direct APK link. */
  url: string;
}

const DEFAULTS: AppVersionInfo = { latestBuild: 0, minBuild: 0, latestName: "", url: "https://play.google.com/store/apps/details?id=space.fineko.kiro" };

class SetAppVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  latestBuild!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minBuild!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  latestName?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}

/** "A new version is available" support: the app asks which build is current and compares it with its own. */
@ApiTags("config")
@Controller()
export class AppVersionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async read(platform: Platform): Promise<AppVersionInfo> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: `app.version.${platform}` } });
    return { ...DEFAULTS, ...((row?.valueJson as Partial<AppVersionInfo> | null) ?? {}) };
  }

  @Public()
  @Get("config/app-version")
  get(@Query("platform") platform?: string) {
    return this.read(platform === "ios" ? "ios" : "android");
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Put("admin/app-version/:platform")
  async set(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Param("platform") platform: string,
    @Body() dto: SetAppVersionDto,
  ) {
    if (!(PLATFORMS as readonly string[]).includes(platform)) throw new ApiException("VALIDATION_ERROR", "Unknown platform", 400);
    const current = await this.read(platform as Platform);
    const next: AppVersionInfo = {
      latestBuild: dto.latestBuild,
      minBuild: dto.minBuild,
      latestName: dto.latestName ?? current.latestName,
      url: dto.url ?? current.url,
    };
    await this.prisma.systemSetting.upsert({
      where: { key: `app.version.${platform}` },
      create: { key: `app.version.${platform}`, valueJson: next as never },
      update: { valueJson: next as never },
    });
    await this.auditLog.record({ actorUserId: user.id, action: "APP_VERSION_SET", entityType: "SystemSetting", entityId: `app.version.${platform}`, after: next, ip: req.ip });
    return next;
  }
}
