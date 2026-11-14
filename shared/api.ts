/**
 * API contract shared by the server, the web client and the mobile app.
 *
 * Base paths: `/api/v1` (versioned, used by mobile) and `/api` (legacy alias for the web client).
 * All request bodies/params/queries are validated against these schemas on the server.
 */
import { z } from "zod";
import type { Category, Order, Product, User, CartItem } from "./schema.js";

export const API_VERSION = "v1";

// ---- Error envelope -------------------------------------------------------
export const errorCodes = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
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
export const updateOrderStatusBody = z.object({ status: z.enum(orderStatuses) });

// ---- Response types -------------------------------------------------------
export type UserResponse = User;
export type CategoryResponse = Category;
export type ProductResponse = Product;
export type CartItemResponse = CartItem & { product: Product };
export type OrderResponse = Order;
export type OrderDetailResponse = Order & {
  orderItems: Array<{ product: Product; quantity: number; price: string }>;
};
