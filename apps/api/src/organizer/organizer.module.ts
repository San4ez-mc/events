import { Global, Module } from "@nestjs/common";
import { EventAccessService } from "./event-access.service";

/**
 * Global because EventAccessService is a cross-cutting authorization
 * dependency (events, registrations, collaborators, invitations, event
 * series all need it) — same rationale as PrismaModule being global.
 */
@Global()
@Module({
  providers: [EventAccessService],
  exports: [EventAccessService],
})
export class OrganizerModule {}
