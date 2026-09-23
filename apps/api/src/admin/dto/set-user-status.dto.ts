import { IsIn } from "class-validator";
import type { UserStatus } from "@kiro/types";

const STATUSES = ["ACTIVE", "SUSPENDED", "BLOCKED", "DELETED"] as const;

export class SetUserStatusDto {
  @IsIn(STATUSES)
  status!: UserStatus;
}
