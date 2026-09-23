import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional } from "class-validator";

const RESOLUTIONS = ["RESOLVED", "DISMISSED"] as const;

export class ResolveReportDto {
  @IsIn(RESOLUTIONS)
  status!: (typeof RESOLUTIONS)[number];

  /** When the target is a REVIEW and this report was valid, also flips that review to HIDDEN. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideTarget?: boolean;
}
