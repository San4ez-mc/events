import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorCode } from "@kiro/types";

/**
 * Every thrown error in business logic should be an ApiException so the
 * response always carries a stable `error.code` (§89). Never throw a bare
 * HttpException from a service/controller.
 */
export class ApiException extends HttpException {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, string[]>,
  ) {
    super({ code, message, details }, status);
  }
}
