import { IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, Validate } from "class-validator";
import { ValidatorConstraint, type ValidatorConstraintInterface } from "class-validator";

@ValidatorConstraint({ name: "nonZeroInt", async: false })
class NonZeroConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "number" && value !== 0;
  }
  defaultMessage(): string {
    return "delta must not be zero";
  }
}

export class AdjustCreditsDto {
  @IsUUID()
  userId!: string;

  @IsInt()
  @Validate(NonZeroConstraint)
  delta!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description!: string;
}
