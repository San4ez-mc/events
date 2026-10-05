import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsUrl, ValidateNested } from "class-validator";

const TYPES = ["INSTAGRAM", "TELEGRAM", "FACEBOOK", "TIKTOK", "WEBSITE", "OTHER"] as const;

export class SocialLinkDto {
  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  /** People paste "site.com/page" without a scheme; accept it as https rather than failing the whole profile save. */
  @Transform(({ value }) => {
    if (typeof value !== "string") return value;
    const v = value.trim();
    return v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? `https://${v.replace(/^\/+/, "")}` : v;
  })
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  url!: string;
}

/** UX §21 — the user's whole set of public social links, replaced in one call. */
export class SetSocialLinksDto {
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  links!: SocialLinkDto[];
}
