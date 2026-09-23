import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsIn } from "class-validator";
import type { CollaboratorPermission } from "@kiro/types";

const PERMISSIONS = [
  "EDIT_EVENT",
  "MANAGE_REGISTRATIONS",
  "MANAGE_PAYMENTS",
  "SEND_NOTIFICATIONS",
  "MANAGE_CHAT",
  "INVITE_PREVIOUS_PARTICIPANTS",
  "VIEW_ANALYTICS",
] as const;

export class UpdateCollaboratorDto {
  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(PERMISSIONS, { each: true })
  permissions!: CollaboratorPermission[];
}
