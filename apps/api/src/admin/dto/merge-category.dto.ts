import { IsUUID } from "class-validator";

export class MergeCategoryDto {
  @IsUUID()
  targetCategoryId!: string;
}
