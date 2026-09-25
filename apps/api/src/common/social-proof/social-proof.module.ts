import { Global, Module } from "@nestjs/common";
import { SocialProofService } from "./social-proof.service";

/** Global: every card-producing module (discovery, search, events) needs it. */
@Global()
@Module({ providers: [SocialProofService], exports: [SocialProofService] })
export class SocialProofModule {}
