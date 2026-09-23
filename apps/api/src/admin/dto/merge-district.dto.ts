import { IsUUID } from "class-validator";

export class MergeDistrictDto {
  @IsUUID()
  targetDistrictId!: string;
}
