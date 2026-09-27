import { Global, Module } from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";
import { FlagsController } from "./flags.controller";
import { AppVersionController } from "./app-version.controller";

@Global()
@Module({ providers: [FeatureFlagsService], controllers: [FlagsController, AppVersionController], exports: [FeatureFlagsService] })
export class FlagsModule {}
