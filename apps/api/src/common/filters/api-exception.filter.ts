import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ApiErrorBody, ApiErrorCode } from "@kiro/types";
import { ApiException } from "../exceptions/api.exception";

/**
 * Catches every exception the app throws (including ones Nest itself throws,
 * e.g. from the global ValidationPipe) and normalizes it to the §89 error
 * contract, so the frontend NEVER has to branch on the framework's own error
 * shape vs. our custom one.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers["x-request-id"] as string) ?? undefined;

    const { status, body } = this.toApiError(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private toApiError(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const { code, message, details } = this.fromNestHttpException(status, response);
      return { status, body: { error: { code, message, details } } };
    }

    // Unknown/unhandled — never leak internals to the client.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    };
  }

  /**
   * Nest's own exceptions (e.g. ValidationPipe's 400, guards' 403/401) don't
   * know about our error codes — map the common ones by status so we still
   * emit a stable code instead of leaking Nest's default message shape.
   */
  private fromNestHttpException(
    status: number,
    response: string | object,
  ): { code: ApiErrorCode; message: string; details?: Record<string, string[]> } {
    const isObj = typeof response === "object" && response !== null;
    const messageRaw = isObj ? (response as Record<string, unknown>)["message"] : response;
    const message = Array.isArray(messageRaw)
      ? "Validation failed"
      : String(messageRaw ?? "Error");

    const details =
      Array.isArray(messageRaw) && messageRaw.every((m) => typeof m === "string")
        ? { _: messageRaw as string[] }
        : undefined;

    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return { code: "AUTH_REQUIRED", message, details };
      case HttpStatus.FORBIDDEN:
        return { code: "FORBIDDEN", message, details };
      case HttpStatus.NOT_FOUND:
        return { code: "NOT_FOUND", message, details };
      case HttpStatus.TOO_MANY_REQUESTS:
        return { code: "RATE_LIMITED", message, details };
      case HttpStatus.BAD_REQUEST:
        return { code: "VALIDATION_ERROR", message, details };
      default:
        return { code: "INTERNAL_ERROR", message, details };
    }
  }
}
