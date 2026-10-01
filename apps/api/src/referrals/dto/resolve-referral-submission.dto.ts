import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const RESOLUTIONS = ["APPROVED", "REJECTED"] as const;

export class ResolveReferralSubmissionDto {
  @IsIn(RESOLUTIONS)
  status!: (typeof RESOLUTIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
