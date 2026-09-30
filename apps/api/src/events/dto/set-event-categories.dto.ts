import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

/** UX §10 — an event's additional (non-primary) categories, replaced in one call. */
export class SetEventCategoriesDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID("4", { each: true })
  categoryIds!: string[];
}
