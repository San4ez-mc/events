import { Global, Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";

/** @Global() — every admin-mutating module needs this, same as OrganizerModule's EventAccessService. */
@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
