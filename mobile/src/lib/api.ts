import type { ApiErrorBody, ErrorCode } from "@shared/api";
import { API_BASE_URL } from "./config";

/** Distinguishes failure kinds so screens and retry logic can react differently. */
export class ApiError extends Error {
  constructor(
    public kind: "offline" | "timeout" | "http",
    message: string,
    public status?: number,
    public code?: ErrorCode,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function api<T>(
  path: string,
  { method = "GET", body, headers, timeoutMs = 15000 }: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    throw e?.name === "AbortError"
      ? new ApiError("timeout", "The request timed out. Check your connection and try again.")
      : new ApiError("offline", "You appear to be offline.");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError("http", err?.message ?? `Request failed (${res.status})`, res.status, err?.code, err?.details);
  }
  return data as T;
}

/** Retry only transient failures of safe requests; never validation/auth errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return false;
  return error.kind !== "http" || (error.status !== undefined && error.status >= 500);
}
