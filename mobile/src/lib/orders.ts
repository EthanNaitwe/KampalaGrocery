import type { OrderStatus } from "@shared/api";
import { colors } from "./theme";

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Received",
  confirmed: "Confirmed",
  preparing: "Being packed",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const statusColor = (s: string | null | undefined) =>
  s === "cancelled" ? colors.danger : s === "delivered" ? colors.primary : colors.text;

/** The happy-path steps shown as a progress timeline. */
export const statusSteps: OrderStatus[] = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"];

/** "Sat 15 Nov" for a YYYY-MM-DD Kampala date (formatted without device-timezone shifts). */
export function formatSlotDate(date: string, today?: string, tomorrow?: string) {
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export const formatDateTime = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
