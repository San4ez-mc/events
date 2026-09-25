import { Global, Module } from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";
import { FlagsController } from "./flags.controller";

@Global()
@Module({ providers: [FeatureFlagsService], controllers: [FlagsController], exports: [FeatureFlagsService] })
export class FlagsModule {}
