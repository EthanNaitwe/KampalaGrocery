import { queryClient } from "@/lib/queryClient";

/** Staff console calls to the versioned API using the web session cookie. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
  });
  // Session ended (signed out elsewhere, switched off, expired): back to the sign-in page.
  if (res.status === 401 && !path.startsWith("/admin/auth/")) {
    queryClient.invalidateQueries({ queryKey: ["admin-session"] });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(data?.error?.message ?? data?.message ?? `Request failed (${res.status})`);
  return data as T;
}

export const ugx = (v: string | number | null | undefined) => `UGX ${Math.round(Number(v ?? 0)).toLocaleString("en-US")}`;

export const fmtDateTime = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtSlotDate = (d: string | null | undefined) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "—";

/** Today's date in Kampala (UTC+3), YYYY-MM-DD. */
export const kampalaToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
