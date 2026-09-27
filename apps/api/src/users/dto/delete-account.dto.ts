import { Equals } from "class-validator";

/** Explicit confirmation flag: the clients show a two-step confirmation before sending this. */
export class DeleteAccountDto {
  @Equals(true)
  confirm!: true;
}
