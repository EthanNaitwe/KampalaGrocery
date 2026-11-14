import type { OrderStatus } from "@shared/api";

/** Labels for staff, plus the verb for the button that moves an order INTO that status. */
export const statusMeta: Record<OrderStatus, { label: string; action: string; badge: string }> = {
  pending: { label: "New", action: "Mark new", badge: "bg-amber-100 text-amber-900" },
  confirmed: { label: "Confirmed", action: "Confirm", badge: "bg-blue-100 text-blue-900" },
  preparing: { label: "Packing", action: "Start packing", badge: "bg-purple-100 text-purple-900" },
  out_for_delivery: { label: "Out for delivery", action: "Dispatch", badge: "bg-indigo-100 text-indigo-900" },
  delivered: { label: "Delivered", action: "Mark delivered", badge: "bg-green-100 text-green-900" },
  cancelled: { label: "Cancelled", action: "Cancel order", badge: "bg-gray-200 text-gray-700" },
};

export const statusLabel = (s: string | null | undefined) => statusMeta[(s ?? "pending") as OrderStatus]?.label ?? s ?? "";
