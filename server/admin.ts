/** Staff console queries and settings. All routes using these are admin-only. */
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.js";
import {
  deliverySlots,
  deliveryZones,
  orderEvents,
  orders,
  products,
  supportIssues,
  users,
  type Admin,
} from "../shared/schema.js";
import {
  LOW_STOCK_THRESHOLD,
  type AdminOrderDetail,
  type AdminOrdersResponse,
  type AdminSummary,
  adminOrdersQuery,
  slotBody,
  slotPatchBody,
  zoneBody,
} from "../shared/api.js";
import { storage } from "./storage.js";
import { kampalaDate, listOrderEvents, listSlotAvailability } from "./checkout.js";
import { listOrderNotifications } from "./notify.js";
import { HttpError } from "./http.js";

const ACTIVE = ["pending", "confirmed", "preparing", "out_for_delivery"] as const;

export async function summary(): Promise<AdminSummary> {
  const today = kampalaDate(0);
  const [{ rows: statusRows }, slots, slotRows, low, { rows: misc }] = await Promise.all([
    db.execute<{ status: string; n: string }>(sql`
      select status, count(*) as n from orders where status in ('pending','confirmed','preparing','out_for_delivery') group by status`),
    listSlotAvailability(),
    db.select().from(deliverySlots).where(eq(deliverySlots.active, true)),
    db
      .select({ id: products.id, name: products.name, stockQuantity: products.stockQuantity })
      .from(products)
      .where(sql`${products.stockQuantity} is not null and ${products.stockQuantity} <= ${LOW_STOCK_THRESHOLD} and ${products.inStock} is not false`)
      .orderBy(asc(products.stockQuantity), asc(products.name)),
    db.execute<{ failed: string; open_issues: string; delivered: string; delivered_total: string; to_agree: string }>(sql`
      select
        (select count(*) from orders where transport_status = 'to_agree' and status in ('pending','confirmed','preparing')) as to_agree,
        (select count(*) from notifications where status = 'failed' and created_at > now() - interval '7 days') as failed,
        (select count(*) from support_issues where status = 'open') as open_issues,
        (select count(*) from orders where status = 'delivered' and slot_date = ${today}::date) as delivered,
        (select coalesce(sum(total), 0) from orders where status = 'delivered' and slot_date = ${today}::date) as delivered_total`),
  ]);
  const cap = new Map(slotRows.map((s) => [s.id, s.capacity]));
  const awaiting = Object.fromEntries(ACTIVE.map((s) => [s, 0])) as AdminSummary["awaiting"];
  statusRows.forEach((r) => (awaiting[r.status as keyof typeof awaiting] = Number(r.n)));

  return {
    transportToAgree: Number(misc[0].to_agree),
    awaiting,
    todaySlots: slots
      .filter((s) => s.date === today)
      .map((s) => ({ ...s, capacity: cap.get(s.slotId) ?? 0, booked: (cap.get(s.slotId) ?? 0) - s.remaining })),
    lowStock: low,
    failedNotifications: Number(misc[0].failed),
    openIssues: Number(misc[0].open_issues),
    deliveredToday: { count: Number(misc[0].delivered), total: Number(misc[0].delivered_total).toFixed(2) },
  };
}

export async function listOrders(q: z.infer<typeof adminOrdersQuery>): Promise<AdminOrdersResponse> {
  const where: SQL[] = [];
  if (q.status === "active") where.push(sql`${orders.status} in ('pending','confirmed','preparing','out_for_delivery')`);
  else if (q.status !== "all") where.push(eq(orders.status, q.status));
  if (q.slotDate) where.push(sql`${orders.slotDate} = ${q.slotDate}::date`);
  if (q.q) {
    const digits = q.q.replace(/\D/g, "");
    const byId = /^\d{1,9}$/.test(q.q.replace(/^#/, "")) ? sql`${orders.id} = ${Number(q.q.replace(/^#/, ""))}` : sql`false`;
    where.push(digits.length >= 4 ? sql`(${byId} or regexp_replace(coalesce(${orders.customerPhone}, ''), '\\D', '', 'g') like ${"%" + digits + "%"})` : byId);
  }
  const cond = where.length ? and(...where) : undefined;

  // Active queue: soonest delivery first. History: newest first.
  const order = q.status === "active"
    ? [sql`${orders.slotDate} asc nulls last`, sql`(select start_time from delivery_slots ds where ds.id = ${orders.slotId}) asc nulls last`, asc(orders.createdAt)]
    : [desc(orders.createdAt)];

  const [items, [{ total }], { rows: counts }] = await Promise.all([
    db
      .select({ o: orders, itemCount: sql<number>`(select coalesce(sum(quantity), 0)::int from order_items oi where oi.order_id = ${orders.id})` })
      .from(orders)
      .where(cond)
      .orderBy(...order)
      .limit(q.limit)
      .offset(q.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(orders).where(cond),
    db.execute<{ status: string; n: string }>(sql`select status, count(*) as n from orders group by status`),
  ]);
  return {
    items: items.map((r) => ({ ...r.o, itemCount: Number(r.itemCount) })),
    total: Number(total),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
  };
}

export async function orderDetail(id: number): Promise<AdminOrderDetail> {
  const order = await storage.getOrder(id);
  if (!order) throw new HttpError("NOT_FOUND", "Order not found");
  const [events, notes, issues] = await Promise.all([
    listOrderEvents(id),
    listOrderNotifications(id),
    db.select().from(supportIssues).where(eq(supportIssues.orderId, id)).orderBy(desc(supportIssues.id)),
  ]);
  const [zone] = order.deliveryZoneId
    ? await db.select({ fee: deliveryZones.fee }).from(deliveryZones).where(eq(deliveryZones.id, order.deliveryZoneId))
    : [];
  return { ...order, events, notifications: notes, issues, zoneGuideFee: zone?.fee ?? null };
}

export async function assignRider(id: number, rider: string | null, admin: Admin) {
  return db.transaction(async (tx) => {
    const [o] = await tx.update(orders).set({ assignedRider: rider, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
    if (!o) throw new HttpError("NOT_FOUND", "Order not found");
    await tx.insert(orderEvents).values({
      orderId: id, fromStatus: o.status, toStatus: o.status ?? "pending", actorAdminId: admin.id,
      note: rider ? `Rider assigned: ${rider}` : "Rider unassigned",
    });
    return o;
  });
}

// ---- Delivery settings --------------------------------------------------------
const uniqueName = (e: any) => {
  if (e?.code === "23505") throw new HttpError("CONFLICT", "An area with that name already exists");
  throw e;
};

export const listAllZones = () => db.select().from(deliveryZones).orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.name));
export const createZone = (b: z.infer<typeof zoneBody>) => db.insert(deliveryZones).values(b).returning().then((r) => r[0]).catch(uniqueName);
export async function updateZone(id: number, b: Partial<z.infer<typeof zoneBody>>) {
  const [z] = await db.update(deliveryZones).set(b).where(eq(deliveryZones.id, id)).returning().catch(uniqueName);
  if (!z) throw new HttpError("NOT_FOUND", "Area not found");
  return z;
}

export const listAllSlots = () => db.select().from(deliverySlots).orderBy(asc(deliverySlots.startTime));
export const createSlot = (b: z.infer<typeof slotBody>) => db.insert(deliverySlots).values(b).returning().then((r) => r[0]);
export async function updateSlot(id: number, b: z.infer<typeof slotPatchBody>) {
  const [current] = await db.select().from(deliverySlots).where(eq(deliverySlots.id, id));
  if (!current) throw new HttpError("NOT_FOUND", "Slot not found");
  const next = { ...current, ...b };
  if (next.endTime <= next.startTime) throw new HttpError("VALIDATION_ERROR", "End time must be after start time");
  const [s] = await db.update(deliverySlots).set(b).where(eq(deliverySlots.id, id)).returning();
  return s;
}

// ---- Support issues -------------------------------------------------------------
export function listIssues(status: "open" | "resolved" | "all") {
  return db
    // General issues have no order, so fall back to the account's phone number.
    .select({ issue: supportIssues, customerPhone: sql<string | null>`coalesce(${orders.customerPhone}, ${users.phoneNumber})` })
    .from(supportIssues)
    .leftJoin(orders, eq(orders.id, supportIssues.orderId))
    .leftJoin(users, eq(users.id, supportIssues.userId))
    .where(status === "all" ? undefined : eq(supportIssues.status, status))
    .orderBy(desc(supportIssues.createdAt))
    .limit(200)
    .then((rows) => rows.map((r) => ({ ...r.issue, customerPhone: r.customerPhone })));
}

export async function resolveIssue(id: number, status: "open" | "resolved", resolution: string | undefined, admin: Admin) {
  const [i] = await db
    .update(supportIssues)
    .set(
      status === "resolved"
        ? { status, resolution: resolution ?? null, resolvedByAdminId: admin.id, resolvedAt: new Date() }
        : { status, resolvedByAdminId: null, resolvedAt: null },
    )
    .where(eq(supportIssues.id, id))
    .returning();
  if (!i) throw new HttpError("NOT_FOUND", "Issue not found");
  return i;
}
