import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { PaymentsService } from "../../payments/payments.service";

/** §72 — every platform payment order, any user. Confirming a manual-IBAN order stays on `PaymentsController` (Phase 9). */
@ApiTags("admin")
@Roles("ADMIN", "SUPER_ADMIN")
@Controller("admin/payments")
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  listAll() {
    return this.paymentsService.listAll();
  }
}
