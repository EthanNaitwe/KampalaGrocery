import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import type { ApiErrorBody, ErrorCode } from "../shared/api.js";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class HttpError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
  }
}

export function sendError(res: Response, code: ErrorCode, message: string, details?: unknown) {
  const body: ApiErrorBody = { message, error: { code, message, ...(details !== undefined && { details }) } };
  return res.status(STATUS[code]).json(body);
}

/** Wraps async handlers so thrown errors reach the error middleware. */
export const handle =
  (fn: (req: any, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.errors[0];
    throw new HttpError("VALIDATION_ERROR", first?.message ?? "Invalid request", result.error.errors);
  }
  return result.data;
}


export function errorMiddleware(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return sendError(res, err.code, err.message, err.details);
  if (err?.type === "entity.parse.failed") return sendError(res, "VALIDATION_ERROR", "Malformed JSON body");
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  return sendError(res, "INTERNAL", "Something went wrong");
}
