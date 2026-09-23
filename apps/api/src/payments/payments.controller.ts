import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PaymentsService } from "./payments.service";
import { CreateOrderDto } from "./dto/create-order.dto";

/** Raw-body access (needed to verify Mono's/WayForPay's webhook signatures) is enabled via `rawBody: true` in main.ts and the e2e test bootstrap. */
function rawBodyOf(req: RawBodyRequest<Request>): Buffer {
  return req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
}

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("orders")
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.paymentsService.createOrder(user.id, dto);
  }

  @Get("orders/mine")
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.listMine(user.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("webhooks/wayforpay")
  async wayForPayWebhook(@Req() req: RawBodyRequest<Request>) {
    await this.paymentsService.handleWebhook("WAYFORPAY", rawBodyOf(req), req.headers);
    // WayForPay expects an acknowledgement body, not just a 2xx status, or it keeps retrying.
    const payload = JSON.parse(rawBodyOf(req).toString("utf-8")) as { orderReference: string };
    return { orderReference: payload.orderReference, status: "accept", time: Math.floor(Date.now() / 1000) };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("webhooks/mono")
  async monoWebhook(@Req() req: RawBodyRequest<Request>) {
    await this.paymentsService.handleWebhook("MONO", rawBodyOf(req), req.headers);
    return { status: "ok" };
  }

  /** Phase 10's `/admin/payments` will be the UI for this; the endpoint itself is needed now for the manual IBAN provider to work at all. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch("orders/:id/confirm-manual")
  confirmManual(@Param("id") id: string) {
    return this.paymentsService.confirmManual(id);
  }
}
