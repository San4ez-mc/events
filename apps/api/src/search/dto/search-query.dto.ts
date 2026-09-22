import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";
import { DiscoveryQueryDto } from "../../discovery/dto/discovery-query.dto";

/** §56 — same filters as discovery (§57), plus the free-text query. */
export class SearchQueryDto extends DiscoveryQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  q!: string;
}
