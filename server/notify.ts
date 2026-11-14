/**
 * Customer order notifications. Called after the order change has committed. Never throws:
 * failures are recorded in `notifications` for staff to see and resend.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "./db.js";
import { notifications, type Order } from "../shared/schema.js";
import { isSmsRecipient, sendSms, smsConfigured } from "./sms.js";
import { HttpError } from "./http.js";

export type OrderTemplate = "order_placed" | "order_confirmed" | "order_out_for_delivery" | "order_delivered" | "order_cancelled";

/** Status changes that text the customer. 'preparing' is internal and stays quiet. */
export const templateForStatus: Partial<Record<string, OrderTemplate>> = {
  confirmed: "order_confirmed",
  out_for_delivery: "order_out_for_delivery",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

const ugx = (v: string | null) => `UGX ${Math.round(Number(v ?? 0)).toLocaleString("en-US")}`;
const support = () => process.env.SUPPORT_PHONE ? ` Questions? Call ${process.env.SUPPORT_PHONE}.` : "";

function formatSlot(o: Order) {
  if (!o.slotDate) return "";
  const d = new Date(`${o.slotDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${d}, ${o.slotLabel ?? ""}`.trim();
}

export function renderOrderMessage(template: OrderTemplate, o: Order): string {
  const ref = `order #${o.id}`;
  switch (template) {
    case "order_placed":
      return `FreshMart: we've received ${ref} (${ugx(o.total)}, cash on delivery). Delivery: ${formatSlot(o)}. We'll text you when it's on the way.`;
    case "order_confirmed":
      return `FreshMart: ${ref} is confirmed for ${formatSlot(o)}.`;
    case "order_out_for_delivery":
      return `FreshMart: ${ref} is on the way${o.assignedRider ? ` with ${o.assignedRider}` : ""}. Please have ${ugx(o.total)} ready.`;
    case "order_delivered":
      return `FreshMart: ${ref} has been delivered. Thank you!${support()}`;
    case "order_cancelled":
      return `FreshMart: ${ref} has been cancelled. You have not been charged.${support()}`;
  }
}

async function attempt(id: number, recipient: string | null, body: string) {
  if (!isSmsRecipient(recipient)) {
    return { status: "skipped", error: "No SMS-capable phone number on the order" } as const;
  }
  if (!smsConfigured()) return { status: "skipped", error: "SMS provider not configured" } as const;
  try {
    const providerId = await sendSms(recipient, body);
    return { status: "sent", providerId } as const;
  } catch (e: any) {
    console.error(`Notification ${id} failed:`, e?.code ?? e?.message);
    return { status: "failed", error: String(e?.message ?? e).slice(0, 500) } as const;
  }
}

async function deliver(id: number) {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, id));
  const r = await attempt(id, n.recipient, n.body);
  const [updated] = await db
    .update(notifications)
    .set({
      status: r.status,
      error: "error" in r ? r.error : null,
      providerId: "providerId" in r ? r.providerId : null,
      attempts: n.attempts + 1,
      sentAt: r.status === "sent" ? new Date() : null,
    })
    .where(eq(notifications.id, id))
    .returning();
  return updated;
}

export async function notifyOrder(order: Order, template: OrderTemplate | undefined) {
  if (!template) return;
  try {
    const [n] = await db
      .insert(notifications)
      .values({
        userId: order.userId,
        orderId: order.id,
        channel: "sms",
        template,
        recipient: order.customerPhone,
        body: renderOrderMessage(template, order),
        status: "pending",
      })
      .returning({ id: notifications.id });
    await deliver(n.id);
  } catch (e) {
    console.error(`Could not record/send ${template} for order ${order.id}:`, (e as Error).message);
  }
}

/** Staff action: retry a failed or skipped message (e.g. after an SMS outage). */
export async function resendNotification(id: number) {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, id));
  if (!n) throw new HttpError("NOT_FOUND", "Notification not found");
  if (n.status === "sent") throw new HttpError("CONFLICT", "Already sent");
  return deliver(id);
}

export const listOrderNotifications = (orderId: number) =>
  db.select().from(notifications).where(eq(notifications.orderId, orderId)).orderBy(desc(notifications.id));
