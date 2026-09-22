import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsOptional, IsUUID } from "class-validator";

/** UX §25 — follow an organizer within specific categories, and/or follow every event they publish. */
export class SubscribeToOrganizerDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allEvents?: boolean;
}
