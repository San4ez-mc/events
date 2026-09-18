import { HttpStatus } from "@nestjs/common";
import { ApiException } from "./api.exception";

/** Thin convenience wrappers around the most frequently thrown error codes. */

export class AuthRequiredException extends ApiException {
  constructor(message = "Authentication required") {
    super("AUTH_REQUIRED", message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenActionException extends ApiException {
  constructor(message = "You don't have permission to perform this action") {
    super("FORBIDDEN", message, HttpStatus.FORBIDDEN);
  }
}

export class ResourceNotFoundException extends ApiException {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, HttpStatus.NOT_FOUND);
  }
}

export class ValidationFailedException extends ApiException {
  constructor(details: Record<string, string[]>, message = "Validation failed") {
    super("VALIDATION_ERROR", message, HttpStatus.BAD_REQUEST, details);
  }
}
