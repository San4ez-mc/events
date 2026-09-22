import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import type { UserEventInteraction } from "@kiro/types";

const INTERACTIONS = ["PASS", "OPEN"] as const;

export class RecordInteractionDto {
  @ApiProperty({ enum: INTERACTIONS })
  @IsIn(INTERACTIONS)
  interaction!: UserEventInteraction;
}
