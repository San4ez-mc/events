import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

// The Flows httpRequest node renders a missing value as "", so empty strings mean "not answered yet".
const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);
// Read the RAW body value (`obj[key]`): with implicit conversion on, `value` is already coerced ("" -> 0 for numbers).
type Ctx = { obj: Record<string, unknown>; key: string };
const optStr = ({ obj, key }: Ctx) => {
  const v = emptyToUndef(obj[key]);
  return typeof v === "string" ? v.trim() || undefined : v;
};
const optNum = ({ obj, key }: Ctx) => {
  const v = emptyToUndef(obj[key]);
  return v === undefined ? undefined : Number(v);
};

/**
 * What the funnel collected in the chat. Everything except email + title is optional: the draft is saved with
 * whatever the organizer managed to answer, the rest is finished in the app.
 */
export class BotEventDraftDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @Transform(optStr)
  @IsString()
  @MaxLength(100)
  organizerName?: string;

  @Transform(optStr)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(optStr)
  @IsString()
  @MaxLength(10000)
  description?: string;

  /** Free text ("концерт", "лекція") or a category slug — resolved server-side against ACTIVE categories. */
  @IsOptional()
  @Transform(optStr)
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Transform(optStr)
  @IsIn(["OFFLINE", "ONLINE"])
  format?: "OFFLINE" | "ONLINE";

  /** Free text ("Львів") or a city slug. */
  @IsOptional()
  @Transform(optStr)
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(optStr)
  @IsString()
  @MaxLength(300)
  addressText?: string;

  @IsOptional()
  @Transform(optStr)
  @IsUrl({ require_tld: false })
  onlineUrl?: string;

  @IsOptional()
  @Transform(optStr)
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @Transform(optStr)
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @Transform(optStr)
  @IsIn(["FREE", "PAID", "DONATION"])
  priceType?: "FREE" | "PAID" | "DONATION";

  @IsOptional()
  @Transform(optNum)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Transform(optNum)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  capacity?: number;

  /** Where people register/buy if the organizer already sells tickets elsewhere. */
  @IsOptional()
  @Transform(optStr)
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  externalRegistrationUrl?: string;
}
