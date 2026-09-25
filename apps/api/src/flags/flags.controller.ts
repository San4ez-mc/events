import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";
import type { Request } from "express";
import { FEATURE_FLAG_KEYS, type FeatureFlagKey } from "@kiro/types";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ApiException } from "../common/exceptions/api.exception";
import { AuditLogService } from "../audit/audit-log.service";
import { FeatureFlagsService } from "./feature-flags.service";

class SetFlagDto {
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags("config")
@Controller()
export class FlagsController {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Clients read this to hide disabled features (e.g. the Google button). */
  @Public()
  @Get("config/flags")
  publicFlags() {
    return this.flags.all();
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Put("admin/flags/:key")
  async set(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Param("key") key: string, @Body() dto: SetFlagDto) {
    if (!(FEATURE_FLAG_KEYS as readonly string[]).includes(key)) {
      throw new ApiException("VALIDATION_ERROR", "Unknown feature flag", 400);
    }
    const values = await this.flags.set(key as FeatureFlagKey, dto.enabled);
    await this.auditLog.record({ actorUserId: user.id, action: "FEATURE_FLAG_SET", entityType: "SystemSetting", entityId: `flag.${key}`, after: { enabled: dto.enabled }, ip: req.ip });
    return values;
  }
}
