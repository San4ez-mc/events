import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class ApproveModerationDto {
  /** Publish without charging the organizer a listing credit (an admin decision, recorded in the audit log). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  waiveCredit?: boolean;
}
