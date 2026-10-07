import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { Public } from "../common/decorators/public.decorator";
import { RateLimit } from "../common/throttle";
import { PrismaService } from "../prisma/prisma.service";

export class JoinIosWaitlistDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;
}

/** Public: iPhone users leave an email and are told when the iOS app is out. Idempotent, so it never reveals who is already on the list. */
@ApiTags("waitlist")
@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @RateLimit(5)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("ios")
  async joinIos(@Body() dto: JoinIosWaitlistDto): Promise<void> {
    await this.prisma.iosWaitlistEntry.upsert({ where: { email: dto.email }, create: { email: dto.email, source: dto.source }, update: {} });
  }
}
