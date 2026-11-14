/**
 * API contract shared by the server, the web client and the mobile app.
 *
 * Base paths: `/api/v1` (versioned, used by mobile) and `/api` (legacy alias for the web client).
 * All request bodies/params/queries are validated against these schemas on the server.
 */
import { z } from "zod";
import type { Category, Order, Product, User, CartItem, Address, DeliveryZone, OrderEvent } from "./schema.js";

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
  out_for_delivery: ["delivered"],
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
  events?: Array<Pick<OrderEvent, "fromStatus" | "toStatus" | "note" | "createdAt">>;
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

export interface QuoteResponse {
  subtotal: string;
  deliveryFee: string;
  total: string;
  minOrder: string;
  itemCount: number;
  /** Blocking problems; the order will be refused while any are present. */
  issues: Array<{ code: "EMPTY_CART" | "OUT_OF_STOCK" | "BELOW_MINIMUM" | "ZONE_UNAVAILABLE"; message: string }>;
}
