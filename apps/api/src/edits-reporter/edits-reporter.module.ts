import { Global, Module } from "@nestjs/common";
import { EditsReporterService } from "./edits-reporter.service";

/** Global so every feature module (and the root exception filter) can inject EditsReporterService without re-importing it. */
@Global()
@Module({
  providers: [EditsReporterService],
  exports: [EditsReporterService],
})
export class EditsReporterModule {}
