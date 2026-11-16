/**
 * API contract shared by the server, the web client and the mobile app.
 *
 * Base paths: `/api/v1` (versioned, used by mobile) and `/api` (legacy alias for the web client).
 * All request bodies/params/queries are validated against these schemas on the server.
 */
import { z } from "zod";
import type {
  Category, Order, Product, User, CartItem, Address, DeliveryZone, DeliverySlot, OrderEvent, Notification, SupportIssue,
} from "./schema.js";

export const API_VERSION = "v1";

// ---- Error envelope -------------------------------------------------------
export const errorCodes = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "GONE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof errorCodes)[number];

/** Every non-2xx response has this shape. `message` is duplicated at the top level for legacy clients. */
export interface ApiErrorBody {
  message: string;
  error: { code: ErrorCode; message: string; details?: unknown };
}

// ---- Primitives -----------------------------------------------------------
export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const productIdParam = z.object({ productId: z.coerce.number().int().positive() });
export const quantity = z.number().int().min(1).max(99);

// ---- Auth -----------------------------------------------------------------
const identifier = {
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  email: z.string().trim().email().max(200).optional(),
};
const hasIdentifier = (d: { phoneNumber?: string; email?: string }) => !!(d.phoneNumber || d.email);

export const requestCodeBody = z
  .object(identifier)
  .refine(hasIdentifier, { message: "Provide a phone number or email", path: ["phoneNumber"] });

/** Mobile sign-in: exchange a code for an access/refresh token pair. */
export const tokenRequestBody = z
  .object({
    ...identifier,
    otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
    deviceName: z.string().trim().max(100).optional(),
  })
  .refine(hasIdentifier, { message: "Provide a phone number or email", path: ["phoneNumber"] });

export const passwordRule = z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters");

/** Sign in with a phone number or email, and a password. */
export const passwordLoginBody = z
  .object({ ...identifier, password: z.string().min(1).max(128), deviceName: z.string().trim().max(100).optional() })
  .refine(hasIdentifier, { message: "Provide a phone number or email", path: ["phoneNumber"] });

/** Forgot password, or sign up with a password: prove the phone or email with a code and set a new password. */
export const passwordResetBody = z
  .object({
    ...identifier,
    otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
    password: passwordRule,
    deviceName: z.string().trim().max(100).optional(),
  })
  .refine(hasIdentifier, { message: "Provide a phone number or email", path: ["phoneNumber"] });

/** Add the other sign-in method (a phone or an email) to a signed-in account: send a code, then confirm it. */
export const linkStartBody = requestCodeBody;
export const linkVerifyBody = z
  .object({ ...identifier, otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits") })
  .refine(hasIdentifier, { message: "Provide a phone number or email", path: ["phoneNumber"] });

/** Which sign-in methods the app should offer. */
export interface AuthMethods {
  email: boolean;
}

/** Set or change a password while signed in. `currentPassword` is required when one is already set. */
export const setPasswordBody = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  password: passwordRule,
});

export interface PasswordStatus { hasPassword: boolean }

export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });
export const logoutBody = z.object({ refreshToken: z.string().min(20).max(200).optional() }).optional();
export const updateProfileBody = z.object({
  firstName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
});

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: User;
}

// ---- Catalog --------------------------------------------------------------
export const listProductsQuery = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).optional().transform((v) => v || undefined),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

// ---- Cart -----------------------------------------------------------------
export const addToCartBody = z.object({ productId: z.number().int().positive(), quantity });
export const updateCartItemBody = z.object({ quantity });
export type AddToCartBody = z.infer<typeof addToCartBody>;
export type UpdateCartItemBody = z.infer<typeof updateCartItemBody>;

// ---- Orders ---------------------------------------------------------------
/** The client never sends prices or totals; the server computes them from the cart. */
export const createOrderBody = z.object({
  customerEmail: z.string().trim().email().max(200).optional(),
  customerPhone: z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, "Invalid phone number").optional(),
  deliveryAddress: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderStatuses = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

/** Allowed status changes. Anything else is rejected by the server. */
export const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  // Cancelling here covers failed deliveries (customer unreachable); stock is returned.
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
/** Statuses from which a customer may cancel their own order. */
export const customerCancellable: OrderStatus[] = ["pending"];

export const paymentMethods = ["cod"] as const;

// ---- Inventory (staff) -----------------------------------------------------
export const stockReasons = ["count", "restock", "adjustment"] as const;
/** `set` = physical count (absolute). `delta` = delivery (+) or write-off (-). */
export const adjustStockBody = z.union([
  z.object({ set: z.number().int().min(0).max(1_000_000), reason: z.literal("count"), note: z.string().trim().max(500).optional() }),
  z.object({
    delta: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, "Change can't be zero"),
    reason: z.enum(["restock", "adjustment"]),
    note: z.string().trim().max(500).optional(),
  }),
]);
export type AdjustStockBody = z.infer<typeof adjustStockBody>;

/** Customers see "Only N left" at or below this. */
export const LOW_STOCK_THRESHOLD = 5;

/** Units a customer may buy right now: 0 when switched off, Infinity when not counted yet. */
export function sellableQuantity(p: { inStock: boolean | null; stockQuantity: number | null }): number {
  if (p.inStock === false) return 0;
  return p.stockQuantity ?? Number.POSITIVE_INFINITY;
}

// ---- Delivery & checkout --------------------------------------------------
export const createAddressBody = z.object({
  label: z.string().trim().max(50).optional(),
  zoneId: z.number().int().positive(),
  line: z.string().trim().min(3, "Enter the street, building or landmark").max(300),
  instructions: z.string().trim().max(500).optional(),
  contactPhone: z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, "Invalid phone number").optional(),
  /** GPS pin from "Use my current location" (both or neither). */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
  message: "Location needs both latitude and longitude",
  path: ["latitude"],
});
export type CreateAddressBody = z.infer<typeof createAddressBody>;

export const quoteBody = z.object({ addressId: z.number().int().positive() });

export const placeOrderBody = z.object({
  addressId: z.number().int().positive(),
  slotId: z.number().int().positive(),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  paymentMethod: z.enum(paymentMethods),
  customerName: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type PlaceOrderBody = z.infer<typeof placeOrderBody>;

/** Required on POST /api/v1/orders so retries and double taps never create a second order. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const idempotencyKey = z.string({ required_error: "Idempotency-Key header is required" }).regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid Idempotency-Key");

export const cancelOrderBody = z.object({ reason: z.string().trim().max(500).optional() }).optional();
export const updateOrderStatusBody = z.object({
  status: z.enum(orderStatuses),
  note: z.string().trim().max(500).optional(),
});

// ---- Response types -------------------------------------------------------
export type UserResponse = User;
export type CategoryResponse = Category;
export type ProductResponse = Product;
export type CartItemResponse = CartItem & { product: Product };
export type OrderResponse = Order;
export type OrderDetailResponse = Order & {
  orderItems: Array<{ product: Product; quantity: number; price: string }>;
  events?: Array<Pick<OrderEvent, "fromStatus" | "toStatus" | "note" | "createdAt"> & { actorName?: string | null }>;
};

export type ZoneResponse = Pick<DeliveryZone, "id" | "name" | "fee" | "minOrder">;
export type AddressResponse = Address & { zoneName: string };

export interface SlotAvailability {
  slotId: number;
  label: string;
  /** Kampala local date, YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  remaining: number;
  available: boolean;
  /** Why it's unavailable, if it is. */
  reason?: "full" | "closed";
}

/** Transport is agreed with the customer after ordering; until then the fee is null. */
export type TransportStatus = "to_agree" | "agreed";

export interface QuoteResponse {
  subtotal: string;
  /** Always null at checkout: transport is agreed with FreshMart after the order is placed. */
  deliveryFee: string | null;
  /** Amount known now (items only). Transport is added once agreed. */
  total: string;
  transport: TransportStatus;
  minOrder: string;
  itemCount: number;
  /** Blocking problems; the order will be refused while any are present. */
  issues: Array<{ code: "EMPTY_CART" | "OUT_OF_STOCK" | "BELOW_MINIMUM" | "ZONE_UNAVAILABLE"; message: string }>;
}

// ---- Support ----------------------------------------------------------------
export const issueCategories = ["missing_item", "wrong_item", "damaged", "late", "payment", "other"] as const;
export const issueCategoryLabels: Record<(typeof issueCategories)[number], string> = {
  missing_item: "Missing item",
  wrong_item: "Wrong item",
  damaged: "Damaged or poor quality",
  late: "Late delivery",
  payment: "Payment",
  other: "Something else",
};
export const createIssueBody = z.object({
  category: z.enum(issueCategories),
  message: z.string().trim().min(5, "Tell us a little more").max(2000),
});
export interface SupportInfo {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  hours: string | null;
}
export type IssueResponse = SupportIssue;
/** Report from the app's Issues section: about an order, or general (no order). */
export const reportIssueBody = createIssueBody.extend({ orderId: z.number().int().positive().nullable().optional() });

// ---- Staff console ------------------------------------------------------------
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");
const moneyStr = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, "Invalid amount"));

export const zoneBody = z.object({
  name: z.string().trim().min(2).max(100),
  fee: moneyStr,
  minOrder: moneyStr.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export const slotBody = z
  .object({
    label: z.string().trim().min(2).max(50),
    startTime: hhmm,
    endTime: hhmm,
    capacity: z.number().int().min(0).max(10_000),
    cutoffMinutes: z.number().int().min(0).max(24 * 60).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: "End time must be after start time", path: ["endTime"] });
export const slotPatchBody = z.object({
  label: z.string().trim().min(2).max(50).optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  capacity: z.number().int().min(0).max(10_000).optional(),
  cutoffMinutes: z.number().int().min(0).max(24 * 60).optional(),
  active: z.boolean().optional(),
});

export const adminOrdersQuery = z.object({
  /** "active" = not yet delivered or cancelled. */
  status: z.union([z.enum(orderStatuses), z.literal("active"), z.literal("all")]).default("active"),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Order number or customer phone digits. */
  q: z.string().trim().max(50).optional().transform((v) => v || undefined),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const adminOrderPatchBody = z.object({ assignedRider: z.string().trim().max(100).nullable() });
export const resolveIssueBody = z.object({
  status: z.enum(["open", "resolved"]),
  resolution: z.string().trim().max(2000).optional(),
});

export interface AdminOrderRow extends Order {
  itemCount: number;
}
export interface AdminOrdersResponse {
  items: AdminOrderRow[];
  total: number;
  /** Counts per status across all orders (for queue tabs). */
  counts: Record<string, number>;
}
export interface AdminOrderDetail extends OrderDetailResponse {
  notifications: Notification[];
  issues: SupportIssue[];
  /** The delivery area's guide fee, to help staff when agreeing transport. */
  zoneGuideFee: string | null;
}
export const agreeTransportBody = z.object({
  fee: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, "Invalid amount")),
  note: z.string().trim().max(500).optional(),
});

export interface AdminSummary {
  /** Orders still waiting for a transport fee to be agreed with the customer. */
  transportToAgree: number;
  awaiting: Record<"pending" | "confirmed" | "preparing" | "out_for_delivery", number>;
  todaySlots: Array<SlotAvailability & { booked: number; capacity: number }>;
  lowStock: Array<Pick<Product, "id" | "name" | "stockQuantity">>;
  failedNotifications: number;
  openIssues: number;
  deliveredToday: { count: number; total: string };
}
export type AdminZone = DeliveryZone;
export type AdminSlot = DeliverySlot;

// ---- Staff console accounts ------------------------------------------------
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200);
export const adminRole = z.enum(["owner", "staff"]);

export const adminLoginBody = z.object({ email, password: z.string().min(1).max(128) });
export const adminForgotBody = z.object({ email });
/** Accept an invite or finish a reset: the emailed token plus the new password. */
export const adminSetPasswordBody = z.object({ token: z.string().min(20).max(200), password: passwordRule });
export const adminChangePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), password: passwordRule });
export const createStaffBody = z.object({ email, name: z.string().trim().min(1).max(100), role: adminRole.default("staff") });
export const updateStaffBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: adminRole.optional(),
  active: z.boolean().optional(),
});

/** What the console knows about the signed-in staff member (never the password hash). */
export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
}

export interface StaffMember extends AdminProfile {
  active: boolean;
  /** False until they accept their invite and set a password. */
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ---- Categories (owners) ------------------------------------------------------
const categoryName = z.string().trim().min(1, "Enter a name").max(100);
/** One emoji (flags and skin tones are several code points, so allow a few). */
const categoryIcon = z.string().trim().max(16, "Use a single emoji").nullable();

export const categoryBody = z.object({ name: categoryName, icon: categoryIcon.optional() });
export const categoryPatchBody = z
  .object({ name: categoryName.optional(), icon: categoryIcon.optional() })
  .refine((b) => b.name !== undefined || b.icon !== undefined, { message: "Nothing to change" });
/** Every category id, in the new order. */
export const categoryOrderBody = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

export interface AdminCategory extends CategoryResponse {
  /** Products in this category (a category with products can't be deleted). */
  productCount: number;
}
