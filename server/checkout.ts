/**
 * Checkout, delivery and order lifecycle. Every price, fee and total is computed here from the
 * database; nothing the client sends about money is trusted.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  admins,
  addresses,
  cartItems,
  deliverySlots,
  deliveryZones,
  orderEvents,
  orderItems,
  orders,
  products,
  type Admin,
  type Order,
  type User,
} from "../shared/schema.js";
import {
  customerCancellable,
  orderTransitions,
  type AddressResponse,
  type CreateAddressBody,
  type OrderStatus,
  type PlaceOrderBody,
  type QuoteResponse,
  type SlotAvailability,
  type ZoneResponse,
} from "../shared/api.js";
import { HttpError } from "./http.js";
import { actorCols, deductForOrder, restockForOrder, type Actor, sellableQuantity, shortageMessage, type Shortage } from "./inventory.js";

function shortagesOf(cart: Array<{ productId: number; name: string; quantity: number; inStock: boolean | null; stockQuantity: number | null }>): Shortage[] {
  return cart.flatMap((i) => {
    const available = sellableQuantity(i);
    return available < i.quantity
      ? [{ productId: i.productId, name: i.name, requested: i.quantity, available: Number.isFinite(available) ? available : 0 }]
      : [];
  });
}

export const BOOKING_DAYS = 3; // today + 2
const KAMPALA_OFFSET = "+03:00"; // East Africa Time, no DST

const cents = (v: string | number) => Math.round(Number(v) * 100);
const money = (c: number) => (c / 100).toFixed(2);

/** YYYY-MM-DD in Kampala, `offsetDays` from today. */
export function kampalaDate(offsetDays = 0, now = Date.now()): string {
  return new Date(now + 3 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}
const slotStart = (date: string, time: string) => new Date(`${date}T${time}:00${KAMPALA_OFFSET}`);

// ---- Zones & slots ----------------------------------------------------------
export async function listZones(): Promise<ZoneResponse[]> {
  return db
    .select({ id: deliveryZones.id, name: deliveryZones.name, fee: deliveryZones.fee, minOrder: deliveryZones.minOrder })
    .from(deliveryZones)
    .where(eq(deliveryZones.active, true))
    .orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.name));
}

export async function listSlotAvailability(): Promise<SlotAvailability[]> {
  const dates = Array.from({ length: BOOKING_DAYS }, (_, i) => kampalaDate(i));
  const slots = await db.select().from(deliverySlots).where(eq(deliverySlots.active, true)).orderBy(asc(deliverySlots.startTime));
  const { rows: counts } = await db.execute<{ slot_id: number; slot_date: string; n: string }>(sql`
    select slot_id, to_char(slot_date, 'YYYY-MM-DD') as slot_date, count(*) as n from orders
    where slot_date between ${dates[0]}::date and ${dates[dates.length - 1]}::date
      and status <> 'cancelled' and slot_id is not null
    group by slot_id, slot_date`);
  const used = new Map(counts.map((c) => [`${c.slot_id}:${c.slot_date}`, Number(c.n)]));

  const now = Date.now();
  return dates.flatMap((date) =>
    slots.map((s) => {
      const remaining = Math.max(0, s.capacity - (used.get(`${s.id}:${date}`) ?? 0));
      const closed = now >= slotStart(date, s.startTime).getTime() - s.cutoffMinutes * 60_000;
      return {
        slotId: s.id,
        label: s.label,
        date,
        startTime: s.startTime,
        endTime: s.endTime,
        remaining,
        available: !closed && remaining > 0,
        ...(closed ? { reason: "closed" as const } : remaining === 0 ? { reason: "full" as const } : {}),
      };
    }),
  );
}

// ---- Addresses --------------------------------------------------------------
export async function listAddresses(userId: string): Promise<AddressResponse[]> {
  const rows = await db
    .select({ a: addresses, zoneName: deliveryZones.name })
    .from(addresses)
    .innerJoin(deliveryZones, eq(addresses.zoneId, deliveryZones.id))
    .where(eq(addresses.userId, userId))
    .orderBy(asc(addresses.id));
  return rows.map((r) => ({ ...r.a, zoneName: r.zoneName }));
}

export async function createAddress(userId: string, body: CreateAddressBody): Promise<AddressResponse> {
  const [zone] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, body.zoneId));
  if (!zone || !zone.active) throw new HttpError("VALIDATION_ERROR", "We don't deliver to that area yet");
  const [row] = await db.insert(addresses).values({ ...body, userId }).returning();
  return { ...row, zoneName: zone.name };
}

export async function deleteAddress(userId: string, id: number) {
  const deleted = await db
    .delete(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .returning({ id: addresses.id });
  if (deleted.length === 0) throw new HttpError("NOT_FOUND", "Address not found");
}

// ---- Quote ------------------------------------------------------------------
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

async function loadCart(x: Exec, userId: string) {
  return x
    .select({
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      name: products.name,
      price: products.price,
      inStock: products.inStock,
      stockQuantity: products.stockQuantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, userId))
    .orderBy(asc(cartItems.id));
}

async function loadAddress(x: Exec, userId: string, addressId: number) {
  const [row] = await x
    .select({ a: addresses, zone: deliveryZones })
    .from(addresses)
    .innerJoin(deliveryZones, eq(addresses.zoneId, deliveryZones.id))
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
  if (!row) throw new HttpError("NOT_FOUND", "Address not found");
  return row;
}

function price(cart: Awaited<ReturnType<typeof loadCart>>, zone: typeof deliveryZones.$inferSelect): QuoteResponse {
  const subtotal = cart.reduce((s, i) => s + cents(i.price) * i.quantity, 0);
  const issues: QuoteResponse["issues"] = [];
  if (cart.length === 0) issues.push({ code: "EMPTY_CART", message: "Your cart is empty" });
  const short = shortagesOf(cart);
  if (short.length) issues.push({ code: "OUT_OF_STOCK", message: shortageMessage(short) });
  if (!zone.active) issues.push({ code: "ZONE_UNAVAILABLE", message: `We're not delivering to ${zone.name} right now` });
  if (cart.length && subtotal < cents(zone.minOrder)) {
    issues.push({ code: "BELOW_MINIMUM", message: `Minimum order for ${zone.name} is UGX ${Number(zone.minOrder).toLocaleString("en-US")}` });
  }
  return {
    subtotal: money(subtotal),
    // Transport is agreed with the customer after ordering (staff record it in the console).
    deliveryFee: null,
    total: money(subtotal),
    transport: "to_agree",
    minOrder: money(cents(zone.minOrder)),
    itemCount: cart.reduce((n, i) => n + i.quantity, 0),
    issues,
  };
}

export async function quote(userId: string, addressId: number): Promise<QuoteResponse> {
  const { zone } = await loadAddress(db, userId, addressId);
  return price(await loadCart(db, userId), zone);
}

// ---- Place order ------------------------------------------------------------
async function findByKey(userId: string, key: string) {
  const [o] = await db.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, key)));
  return o;
}

/**
 * Creates the order atomically: validates cart, stock, zone, slot capacity and cutoff;
 * snapshots prices/address; clears the cart; records the first audit event.
 * Replays with the same Idempotency-Key return the original order (`replayed: true`).
 */
export async function placeOrder(user: User, body: PlaceOrderBody, key: string): Promise<{ order: Order; replayed: boolean }> {
  const existing = await findByKey(user.id, key);
  if (existing) return { order: existing, replayed: true };

  try {
    let replayed = false;
    const order = await db.transaction(async (tx) => {
      // One checkout at a time per customer. Requests that queued behind an identical one
      // then see its committed order below, instead of an emptied cart.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"order:" + user.id}))`);
      const [dup] = await tx.select().from(orders).where(and(eq(orders.userId, user.id), eq(orders.idempotencyKey, key)));
      if (dup) {
        replayed = true;
        return dup;
      }

      // Serialize bookings per slot so capacity can't be oversold by concurrent orders.
      await tx.execute(sql`select id from delivery_slots where id = ${body.slotId} for update`);
      const [slot] = await tx.select().from(deliverySlots).where(eq(deliverySlots.id, body.slotId));
      if (!slot || !slot.active) throw new HttpError("VALIDATION_ERROR", "That delivery slot isn't available");

      const validDates = Array.from({ length: BOOKING_DAYS }, (_, i) => kampalaDate(i));
      if (!validDates.includes(body.slotDate)) throw new HttpError("VALIDATION_ERROR", "Choose a delivery date in the next few days");
      const cutoff = slotStart(body.slotDate, slot.startTime).getTime() - slot.cutoffMinutes * 60_000;
      if (Date.now() >= cutoff) throw new HttpError("CONFLICT", "That delivery slot has closed. Please pick another.");

      const { rows: used } = await tx.execute<{ n: string }>(sql`
        select count(*) as n from orders
        where slot_id = ${body.slotId} and slot_date = ${body.slotDate}::date and status <> 'cancelled'`);
      if (Number(used[0].n) >= slot.capacity) throw new HttpError("CONFLICT", "That delivery slot just filled up. Please pick another.");

      const { a: address, zone } = await loadAddress(tx, user.id, body.addressId);
      // Cash on delivery: staff call to agree transport, so every order needs a phone.
      const customerPhone = address.contactPhone || user.phoneNumber;
      if (!customerPhone) {
        throw new HttpError("VALIDATION_ERROR", "Add a contact phone to this address so we can call you about delivery", {
          field: "contactPhone",
        });
      }
      // Lock the cart rows so a concurrent cart edit can't change what's being bought.
      await tx.execute(sql`select id from cart_items where user_id = ${user.id} for update`);
      const cart = await loadCart(tx, user.id);
      const q = price(cart, zone);
      if (q.issues.length) {
        const conflict = q.issues.find((i) => i.code === "OUT_OF_STOCK" || i.code === "ZONE_UNAVAILABLE");
        throw new HttpError(conflict ? "CONFLICT" : "VALIDATION_ERROR", q.issues[0].message, {
          issues: q.issues,
          ...(conflict?.code === "OUT_OF_STOCK" && {
            productIds: shortagesOf(cart).map((s) => s.productId),
          }),
        });
      }

      const [created] = await tx
        .insert(orders)
        .values({
          userId: user.id,
          status: "pending",
          subtotal: q.subtotal,
          deliveryFee: null,
          total: q.total,
          transportStatus: "to_agree",
          customerName: body.customerName || [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
          customerPhone,
          customerEmail: user.email,
          deliveryAddress: [address.label, address.line].filter(Boolean).join(" - "),
          deliveryInstructions: address.instructions,
          deliveryLatitude: address.latitude,
          deliveryLongitude: address.longitude,
          deliveryZoneId: zone.id,
          deliveryZoneName: zone.name,
          slotId: body.slotId,
          slotDate: body.slotDate,
          slotLabel: slot.label,
          paymentMethod: body.paymentMethod,
          paymentStatus: "unpaid",
          idempotencyKey: key,
          notes: body.notes || null,
        })
        .returning();

      // Locks product rows and re-checks stock; a shortage here rolls back the whole order.
      await deductForOrder(tx, cart, created.id, user.id);
      await tx.insert(orderItems).values(
        cart.map((i) => ({ orderId: created.id, productId: i.productId, productName: i.name, quantity: i.quantity, price: i.price })),
      );
      await tx.insert(orderEvents).values({ orderId: created.id, fromStatus: null, toStatus: "pending", actorUserId: user.id });
      await tx.delete(cartItems).where(eq(cartItems.userId, user.id));
      return created;
    });
    return { order, replayed };
  } catch (e: any) {
    // Two concurrent requests with the same key: the loser hits the unique index.
    if (e?.code === "23505" && String(e?.constraint ?? e?.message).includes("UQ_orders_user_idempotency")) {
      const o = await findByKey(user.id, key);
      if (o) return { order: o, replayed: true };
    }
    throw e;
  }
}

// ---- Lifecycle --------------------------------------------------------------
async function transition(orderId: number, actor: Actor, to: OrderStatus, guard: (o: Order) => void, note?: string) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: number }>(sql`select id from orders where id = ${orderId} for update`);
    if (!rows[0]) throw new HttpError("NOT_FOUND", "Order not found");
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId));
    guard(o);
    const from = (o.status ?? "pending") as OrderStatus;
    if (!orderTransitions[from]?.includes(to)) {
      throw new HttpError("CONFLICT", `Order can't move from ${from} to ${to}`);
    }
    if (to === "out_for_delivery" && o.transportStatus === "to_agree") {
      throw new HttpError("CONFLICT", "Agree the transport fee with the customer before dispatching");
    }
    const paymentStatus =
      o.paymentMethod === "cod" ? (to === "delivered" ? "paid" : to === "cancelled" ? "void" : o.paymentStatus) : o.paymentStatus;
    const [updated] = await tx
      .update(orders)
      .set({ status: to, paymentStatus, updatedAt: new Date(), ...(to === "cancelled" && { cancelledAt: new Date() }) })
      .where(eq(orders.id, orderId))
      .returning();
    if (to === "cancelled") await restockForOrder(tx, orderId, actor);
    await tx.insert(orderEvents).values({ orderId, fromStatus: from, toStatus: to, ...actorCols(actor), note: note ?? null });
    return updated;
  });
}

export function cancelByCustomer(user: User, orderId: number, reason?: string) {
  return transition(
    orderId,
    { userId: user.id },
    "cancelled",
    (o) => {
      if (o.userId !== user.id) throw new HttpError("NOT_FOUND", "Order not found");
      if (!customerCancellable.includes((o.status ?? "pending") as OrderStatus)) {
        throw new HttpError("CONFLICT", "This order is already being prepared and can't be cancelled in the app. Please contact support.");
      }
    },
    reason ? `Customer: ${reason}` : "Cancelled by customer",
  );
}

export function changeStatusByAdmin(admin: Admin, orderId: number, to: OrderStatus, note?: string) {
  return transition(orderId, { adminId: admin.id }, to, () => {}, note);
}

export async function listOrderEvents(orderId: number) {
  return db
    .select({
      fromStatus: orderEvents.fromStatus,
      toStatus: orderEvents.toStatus,
      note: orderEvents.note,
      createdAt: orderEvents.createdAt,
      /** Staff member's name, or null when the customer (or the system) made the change. */
      actorName: admins.name,
    })
    .from(orderEvents)
    .leftJoin(admins, eq(admins.id, orderEvents.actorAdminId))
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.id));
}

/**
 * Staff record the transport fee agreed with the customer. Allowed until the order leaves
 * (it can be corrected before dispatch). Total becomes items + transport.
 */
export async function agreeTransport(admin: Admin, orderId: number, fee: string, note?: string) {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw new HttpError("NOT_FOUND", "Order not found");
    if (!["pending", "confirmed", "preparing"].includes(o.status ?? "pending")) {
      throw new HttpError("CONFLICT", "Transport can only be set before the order is dispatched");
    }
    const subtotal = cents(o.subtotal ?? o.total);
    const [updated] = await tx
      .update(orders)
      .set({ deliveryFee: money(cents(fee)), total: money(subtotal + cents(fee)), transportStatus: "agreed", updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    await tx.insert(orderEvents).values({
      orderId, fromStatus: o.status, toStatus: o.status ?? "pending", actorAdminId: admin.id,
      note: `Transport agreed: UGX ${Math.round(Number(fee)).toLocaleString("en-US")}${note ? ` (${note})` : ""}`,
    });
    return updated;
  });
}
