import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  decimal,
  boolean,
  uniqueIndex,
  date,
  check,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Web (staff console) sessions, used by connect-pg-simple.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  phoneNumber: varchar("phone_number").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---- Staff console accounts (separate from customers) ------------------------
/** People who run FreshMart. Sign in to the web console with email + password. */
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email", { length: 200 }).notNull().unique(), // stored lower-case
  name: varchar("name", { length: 100 }).notNull(),
  /** owner: everything, incl. staff accounts, products, prices, delivery settings. staff: day-to-day operations. */
  role: varchar("role", { length: 10 }).notNull().default("staff"),
  /** scrypt hash (server/passwords.ts). Null until the invite is accepted. */
  passwordHash: varchar("password_hash", { length: 255 }),
  active: boolean("active").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Single-use links for accepting an invite or resetting a password. Only a SHA-256 of the token is stored. */
export const adminTokens = pgTable("admin_tokens", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id").references(() => admins.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  purpose: varchar("purpose", { length: 10 }).notNull(), // invite | reset
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("IDX_admin_tokens_admin").on(table.adminId, table.createdAt)]);

export type Admin = typeof admins.$inferSelect;
export type AdminRole = "owner" | "staff";

// Optional password sign-in. Kept out of `users` so the hash never travels with user objects.
// `hash` is scrypt in the form scrypt$N$r$p$salt$key (see server/passwords.ts).
export const userPasswords = pgTable("user_passwords", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  hash: varchar("hash", { length: 255 }).notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// OTP verification table. `otp` stores an HMAC-SHA256 hash of the code, never the code itself.
export const otpVerifications = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  phoneNumber: varchar("phone_number").notNull(),
  otp: varchar("otp", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  attempts: integer("attempts").notNull().default(0),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_otp_identifier_created").on(table.phoneNumber, table.createdAt),
  index("IDX_otp_ip_created").on(table.ip, table.createdAt),
]);

// Mobile refresh tokens. Only a SHA-256 hash is stored. Tokens rotate on every use;
// all tokens from one sign-in share a familyId so reuse of an old token revokes the family.
export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  familyId: varchar("family_id", { length: 32 }).notNull(),
  deviceName: varchar("device_name", { length: 100 }),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  replacedAt: timestamp("replaced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_refresh_user").on(table.userId),
  index("IDX_refresh_family").on(table.familyId),
]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  /** An emoji shown in the app's category bubbles. */
  icon: varchar("icon", { length: 50 }),
  /** Order in the app (lowest first); set by owners in the console. */
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [uniqueIndex("UQ_categories_name").on(sql`lower(${table.name})`)]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  image: varchar("image", { length: 500 }),
  categoryId: integer("category_id").references(() => categories.id),
  /** Manual on/off switch (e.g. seasonal). Customers can buy only if this is true AND stock allows. */
  inStock: boolean("in_stock").default(true),
  /** Units on hand. NULL = not counted yet (sellable without limit until staff enter a count). */
  stockQuantity: integer("stock_quantity"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_products_category").on(table.categoryId),
  check("CK_products_stock_nonnegative", sql`${table.stockQuantity} is null or ${table.stockQuantity} >= 0`),
]);

/**
 * Outbound customer messages (SMS today). Every attempt is recorded so staff can see and
 * resend failures; a provider outage never blocks an order update.
 */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  orderId: integer("order_id"),
  channel: varchar("channel", { length: 10 }).notNull(), // sms
  template: varchar("template", { length: 40 }).notNull(), // order_placed | order_confirmed | ...
  recipient: varchar("recipient", { length: 200 }),
  body: text("body").notNull(),
  status: varchar("status", { length: 15 }).notNull(), // sent | failed | skipped
  error: text("error"),
  providerId: varchar("provider_id", { length: 100 }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
}, (table) => [
  index("IDX_notifications_order").on(table.orderId),
  index("IDX_notifications_status").on(table.status, table.createdAt),
]);

/** Customer-reported problems, optionally tied to an order. */
export const supportIssues = pgTable("support_issues", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => orders.id),
  category: varchar("category", { length: 30 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 15 }).notNull().default("open"), // open | resolved
  resolution: text("resolution"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedByAdminId: varchar("resolved_by_admin_id").references(() => admins.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("IDX_issues_status").on(table.status, table.createdAt),
  index("IDX_issues_order").on(table.orderId),
]);

/** Append-only stock ledger: every change to stock_quantity, with reason and actor. */
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  /** Signed change in units (negative = out). */
  delta: integer("delta").notNull(),
  /** Stock after this movement. */
  balance: integer("balance").notNull(),
  reason: varchar("reason", { length: 30 }).notNull(), // order | order_cancelled | restock | adjustment | count
  orderId: integer("order_id"),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  /** Set when a staff member (rather than the customer) made the change. */
  actorAdminId: varchar("actor_admin_id").references(() => admins.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("IDX_inventory_product").on(table.productId, table.createdAt)]);

// ---- Delivery configuration (editable data, not code) ----------------------
export const deliveryZones = pgTable("delivery_zones", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  fee: decimal("fee", { precision: 10, scale: 2 }).notNull(),
  minOrder: decimal("min_order", { precision: 10, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Recurring daily delivery windows in Kampala time (UTC+3). */
export const deliverySlots = pgTable("delivery_slots", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 50 }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(), // "HH:MM"
  endTime: varchar("end_time", { length: 5 }).notNull(),
  capacity: integer("capacity").notNull(),
  /** Orders close this many minutes before the window starts. */
  cutoffMinutes: integer("cutoff_minutes").notNull().default(60),
  active: boolean("active").notNull().default(true),
});

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  label: varchar("label", { length: 50 }),
  zoneId: integer("zone_id").references(() => deliveryZones.id).notNull(),
  line: varchar("line", { length: 300 }).notNull(),
  instructions: varchar("instructions", { length: 500 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  /** GPS pin from the customer's phone, when they chose "Use my current location". */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("IDX_addresses_user").on(table.userId)]);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  /** subtotal + deliveryFee, computed by the server. */
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }),
  customerEmail: varchar("customer_email"),
  customerPhone: varchar("customer_phone"),
  customerName: varchar("customer_name", { length: 200 }),
  /** Snapshot of the address text at order time; later address edits don't rewrite it. */
  deliveryAddress: text("delivery_address"),
  deliveryInstructions: text("delivery_instructions"),
  deliveryLatitude: doublePrecision("delivery_latitude"),
  deliveryLongitude: doublePrecision("delivery_longitude"),
  /** Transport is agreed per order: 'to_agree' until staff record the fee, then 'agreed'. */
  transportStatus: varchar("transport_status", { length: 15 }),
  deliveryZoneId: integer("delivery_zone_id").references(() => deliveryZones.id),
  deliveryZoneName: varchar("delivery_zone_name", { length: 100 }),
  slotId: integer("slot_id").references(() => deliverySlots.id),
  slotDate: date("slot_date"),
  slotLabel: varchar("slot_label", { length: 50 }),
  paymentMethod: varchar("payment_method", { length: 20 }),
  paymentStatus: varchar("payment_status", { length: 20 }),
  idempotencyKey: varchar("idempotency_key", { length: 64 }),
  /** Rider (name/phone) assigned by staff for dispatch. */
  assignedRider: varchar("assigned_rider", { length: 100 }),
  notes: text("notes"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_orders_user").on(table.userId),
  index("IDX_orders_slot").on(table.slotDate, table.slotId),
  uniqueIndex("UQ_orders_user_idempotency").on(table.userId, table.idempotencyKey),
]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  /** Name snapshot so receipts survive catalog renames. */
  productName: varchar("product_name", { length: 200 }),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
}, (table) => [index("IDX_order_items_order").on(table.orderId)]);

/** Audit trail: every status change, who made it and when. */
export const orderEvents = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  actorUserId: varchar("actor_user_id").references(() => users.id),
  /** Set when a staff member (rather than the customer) made the change. */
  actorAdminId: varchar("actor_admin_id").references(() => admins.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("IDX_order_events_order").on(table.orderId)]);

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [uniqueIndex("UQ_cart_user_product").on(table.userId, table.productId)]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  cartItems: many(cartItems),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  orderItems: many(orderItems),
  cartItems: many(cartItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, {
    fields: [cartItems.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
}));

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertOtpVerification = typeof otpVerifications.$inferInsert;
export type OtpVerification = typeof otpVerifications.$inferSelect;

export type RefreshToken = typeof refreshTokens.$inferSelect;

export type InsertCategory = typeof categories.$inferInsert;
export type Category = typeof categories.$inferSelect;

export type InsertProduct = typeof products.$inferInsert;
export type Product = typeof products.$inferSelect;

export type InsertOrder = typeof orders.$inferInsert;
export type Order = typeof orders.$inferSelect;

export type InsertOrderItem = typeof orderItems.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;

export type DeliveryZone = typeof deliveryZones.$inferSelect;
export type DeliverySlot = typeof deliverySlots.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type SupportIssue = typeof supportIssues.$inferSelect;

export type InsertCartItem = typeof cartItems.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;

// Schemas
export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"]),
});

export const sendOtpSchema = z.object({
  phoneNumber: z.string().optional(),
  email: z.string().optional(),
}).refine((data) => {
  const identifier = data.phoneNumber ?? data.email;

  if (!identifier) {
    return false;
  }

  if (data.email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  }

  return /^\+?[0-9\s()-]{10,20}$/.test(identifier);
}, {
  message: "Provide a valid phone number or email address",
  path: ["phoneNumber"],
});

export const verifyOtpSchema = z.object({
  phoneNumber: z.string().optional(),
  email: z.string().optional(),
  otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
}).refine((data) => {
  const identifier = data.phoneNumber ?? data.email;

  if (!identifier) {
    return false;
  }

  if (data.email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  }

  return /^\+?[0-9\s()-]{10,20}$/.test(identifier);
}, {
  message: "Provide a valid phone number or email address",
  path: ["phoneNumber"],
});
