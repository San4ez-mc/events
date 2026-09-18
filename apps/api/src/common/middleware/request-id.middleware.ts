import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const HEADER = "x-request-id";

/** §91 — every request gets an X-Request-ID; generated if the client didn't send one. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[HEADER];
    const requestId = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
    req.headers[HEADER] = requestId;
    res.setHeader("X-Request-ID", requestId);
    next();
  }
}
