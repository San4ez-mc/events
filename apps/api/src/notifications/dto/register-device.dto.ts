import { IsIn, IsNotEmpty, IsString } from "class-validator";
import type { DevicePlatform } from "@kiro/types";

const PLATFORMS = ["IOS", "ANDROID", "WEB"] as const;

/** §41 — a client registering (or re-registering, after a token rotation) its push token. */
export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  pushToken!: string;

  @IsIn(PLATFORMS)
  platform!: DevicePlatform;
}
