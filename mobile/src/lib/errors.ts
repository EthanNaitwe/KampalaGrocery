import { ApiError } from "./api";

/** Human-readable message for any thrown error, including rate-limit wait times. */
export function errorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong. Please try again.";
  if (e.code === "RATE_LIMITED") {
    const s = (e.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    if (s && s < 120) return `Please wait ${s} seconds before trying again.`;
  }
  return e.message;
}
