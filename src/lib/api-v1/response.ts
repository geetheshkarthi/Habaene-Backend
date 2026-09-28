/** Server-side helpers that render the standard success/failure envelope. */
import type { ApiErrorCode, ApiFailure, ApiSuccess } from "./contract";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

/** Thrown by handlers; carries the HTTP status and the standard error code. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "validation_error", message, details);
export const notFound = (message = "Resource not found") =>
  new HttpError(404, "not_found", message);
export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "unauthorized", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const unavailable = (message: string) => new HttpError(503, "unavailable", message);

export function ok<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function fail(
  status: number,
  code: ApiErrorCode | string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiFailure = {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });
