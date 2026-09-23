import { IsIn } from "class-validator";
import type { UserRole } from "@kiro/types";

const ROLES = ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

export class SetUserRoleDto {
  @IsIn(ROLES)
  role!: UserRole;
}
