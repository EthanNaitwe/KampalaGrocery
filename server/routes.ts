import { Router, type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { pool } from "./db.js";
import { isAuthenticated, sendOTP, verifyOTP, logout, normalizePhoneNumber, startWebSession } from "./smsAuth.js";
import { issueTokens, revokeAllForUser, rotateRefreshToken, revokeRefreshToken } from "./tokens.js";
import { changePassword, hasPassword, loginWithPassword, setPassword } from "./passwords.js";
import { insertProductSchema, sendOtpSchema, verifyOtpSchema } from "../shared/schema.js";
import {
  passwordLoginBody, passwordResetBody, setPasswordBody, type PasswordStatus,
  categoryBody, categoryOrderBody, categoryPatchBody, reportIssueBody,
  adminChangePasswordBody, adminForgotBody, adminLoginBody, adminSetPasswordBody, createStaffBody, updateStaffBody,
  idParam,
  productIdParam,
  listProductsQuery,
  addToCartBody,
  updateCartItemBody,
  updateOrderStatusBody,
  requestCodeBody,
  tokenRequestBody,
  refreshBody,
  logoutBody,
  updateProfileBody,
  type TokenResponse,
  createAddressBody,
  quoteBody,
  placeOrderBody,
  idempotencyKey,
  IDEMPOTENCY_HEADER,
  cancelOrderBody,
  adjustStockBody,
  createIssueBody,
  adminOrdersQuery,
  adminOrderPatchBody,
  zoneBody,
  slotBody,
  slotPatchBody,
  resolveIssueBody,
  agreeTransportBody,
  type SupportInfo,
} from "../shared/api.js";
import { notifyOrder, resendNotification, templateForStatus } from "./notify.js";
import {
  summary, listOrders, orderDetail, assignRider, listAllZones, createZone, updateZone,
  listAllSlots, createSlot, updateSlot, listIssues, resolveIssue,
} from "./admin.js";
import { db } from "./db.js";
import { supportIssues } from "../shared/schema.js";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adjustStock, assertCartQuantity, listMovements } from "./inventory.js";
import {
  listZones,
  listSlotAvailability,
  listAddresses,
  createAddress,
  deleteAddress,
  quote,
  placeOrder,
  cancelByCustomer,
  changeStatusByAdmin,
  listOrderEvents,
  agreeTransport,
} from "./checkout.js";
import { HttpError, errorMiddleware, handle, parse, sendError } from "./http.js";
import {
  changeAdminPassword, createStaff, listStaff, loginAdmin, profile, requestPasswordReset, requireOwner, requireStaff,
  resendInvite, setPasswordWithToken, startAdminSession, updateStaff,
} from "./adminAuth.js";
import { createCategory, deleteCategory, listCategoriesWithCounts, reorderCategories, updateCategory } from "./categories.js";

// Stock changes only through POST /products/:id/stock so every change is in the ledger.
const productWriteSchema = insertProductSchema.omit({ stockQuantity: true });

function buildApiRouter(version: "v1" | "legacy"): Router {
  const r = Router();

  r.get("/health", handle(async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok", database: "ok" });
    } catch (err) {
      console.error("Database health check failed:", err);
      sendError(res, "SERVICE_UNAVAILABLE", "Database unreachable");
    }
  }));

  // ---- Auth ---------------------------------------------------------------
  // Codes are 6 digits, single-use, hashed at rest, attempt-limited and throttled (see otp.ts).
  // Responses never reveal whether an account already exists.
  const codeSent = { message: "Verification code sent" };

  r.post("/auth/send-otp", handle(async (req, res) => {
    const body = parse(sendOtpSchema, req.body);
    await sendOTP(body.email ?? body.phoneNumber!, req.ip);
    res.json(codeSent);
  }));

  r.post("/auth/send-email-otp", handle(async (req, res) => {
    const body = parse(sendOtpSchema, { email: req.body?.email ?? req.body?.phoneNumber });
    await sendOTP(body.email!, req.ip);
    res.json(codeSent);
  }));

  // Web: verify code and start a cookie session.
  r.post("/auth/verify-otp", handle(async (req, res) => {
    const body = parse(verifyOtpSchema, req.body);
    const user = await verifyOTP(body.email ?? body.phoneNumber!, body.otp);
    await startWebSession(req, user);
    res.json({ message: "Signed in", user });
  }));

  r.post("/auth/verify-email-otp", handle(async (req, res) => {
    const body = parse(verifyOtpSchema, { email: req.body?.email ?? req.body?.phoneNumber, otp: req.body?.otp });
    const user = await verifyOTP(body.email!, body.otp);
    await startWebSession(req, user);
    res.json({ message: "Signed in", user });
  }));

  // Mobile: request a code (same throttles as web).
  r.post("/auth/otp", handle(async (req, res) => {
    const body = parse(requestCodeBody, req.body);
    await sendOTP(body.email ?? body.phoneNumber!, req.ip);
    res.json(codeSent);
  }));

  // Mobile: exchange a code for tokens.
  r.post("/auth/token", handle(async (req, res) => {
    const body = parse(tokenRequestBody, req.body);
    const user = await verifyOTP(body.email ?? body.phoneNumber!, body.otp);
    const tokens = await issueTokens(user.id, body.deviceName);
    const response: TokenResponse = { ...tokens, user };
    res.json(response);
  }));

  // ---- Password sign-in (optional alternative to codes) ---------------------
  // Mobile: phone + password for tokens. Wrong tries lock the account for a while (see passwords.ts).
  r.post("/auth/password/login", handle(async (req, res) => {
    const body = parse(passwordLoginBody, req.body);
    const user = await loginWithPassword(normalizePhoneNumber(body.phoneNumber), body.password);
    const response: TokenResponse = { ...(await issueTokens(user.id, body.deviceName)), user };
    res.json(response);
  }));

  // Web console: phone + password for a cookie session.
  r.post("/auth/password/session", handle(async (req, res) => {
    const body = parse(passwordLoginBody, req.body);
    const user = await loginWithPassword(normalizePhoneNumber(body.phoneNumber), body.password);
    await startWebSession(req, user);
    res.json({ message: "Signed in", user });
  }));

  // Forgot password (or first sign-up with a password): a fresh code proves the number.
  // Every other device is signed out, since whoever knew the old password may be using it.
  r.post("/auth/password/reset", handle(async (req, res) => {
    const body = parse(passwordResetBody, req.body);
    const user = await verifyOTP(body.phoneNumber, body.otp);
    await setPassword(user.id, body.password);
    await revokeAllForUser(user.id);
    const response: TokenResponse = { ...(await issueTokens(user.id, body.deviceName)), user };
    res.json(response);
  }));

  r.get("/auth/password", isAuthenticated, handle(async (req, res) => {
    const response: PasswordStatus = { hasPassword: await hasPassword(req.user.id) };
    res.json(response);
  }));

  r.put("/auth/password", isAuthenticated, handle(async (req, res) => {
    const body = parse(setPasswordBody, req.body);
    await changePassword(req.user.id, body.password, body.currentPassword);
    res.json({ hasPassword: true } satisfies PasswordStatus);
  }));

  // Mobile: rotate refresh token.
  r.post("/auth/refresh", handle(async (req, res) => {
    const { refreshToken } = parse(refreshBody, req.body);
    const { userId, tokens } = await rotateRefreshToken(refreshToken);
    const user = await storage.getUser(userId);
    if (!user || user.deletedAt) throw new HttpError("UNAUTHORIZED", "Session expired. Please sign in again.");
    const response: TokenResponse = { ...tokens, user };
    res.json(response);
  }));

  r.get("/auth/me", isAuthenticated, handle(async (req, res) => {
    res.json(req.user);
  }));

  r.patch("/auth/me", isAuthenticated, handle(async (req, res) => {
    const body = parse(updateProfileBody, req.body);
    res.json(await storage.updateProfile(req.user.id, body));
  }));

  // Permanently erases personal data; orders are kept without personal identifiers on the user.
  r.delete("/auth/account", isAuthenticated, handle(async (req, res) => {
    await storage.deleteAccount(req.user.id);
    await logout(req);
    res.status(204).send();
  }));

  // Logged-out responds 200 with a message (existing web-client contract).
  r.get("/auth/user", handle(async (req, res) => {
    const userId = req.session?.userId;
    const user = userId ? await storage.getUser(userId) : undefined;
    if (!user || user.deletedAt) return res.json({ message: "User not logged in" });
    res.json(user);
  }));

  // Works for both clients: revokes the mobile refresh token (if given) and ends any web session.
  r.post("/auth/logout", handle(async (req, res) => {
    const body = parse(logoutBody, req.body);
    if (body?.refreshToken) await revokeRefreshToken(body.refreshToken);
    await logout(req);
    res.json({ message: "Logged out successfully" });
  }));

  // ---- Catalog ------------------------------------------------------------
  r.get("/categories", handle(async (_req, res) => {
    res.json(await storage.getCategories());
  }));


  r.get("/products", handle(async (req, res) => {
    const q = parse(listProductsQuery, req.query);
    res.json(q.search ? await storage.searchProducts(q.search) : await storage.getProducts(q.categoryId));
  }));

  r.get("/products/:id", handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const product = await storage.getProduct(id);
    if (!product) throw new HttpError("NOT_FOUND", "Product not found");
    res.json(product);
  }));

  r.post("/products", requireStaff, requireOwner, handle(async (req, res) => {
    const body = parse(productWriteSchema, req.body);
    res.status(201).json(await storage.createProduct(body));
  }));

  r.put("/products/:id", requireStaff, requireOwner, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const body = parse(productWriteSchema.partial(), req.body);
    if (!(await storage.getProduct(id))) throw new HttpError("NOT_FOUND", "Product not found");
    res.json(await storage.updateProduct(id, body));
  }));

  r.delete("/products/:id", requireStaff, requireOwner, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    if (!(await storage.getProduct(id))) throw new HttpError("NOT_FOUND", "Product not found");
    try {
      await storage.deleteProduct(id);
    } catch (e: any) {
      // Referenced by orders, carts or the stock ledger: history must be kept.
      if (e?.code === "23503") {
        throw new HttpError("CONFLICT", "This product has order or stock history. Switch it off sale instead of deleting it.");
      }
      throw e;
    }
    res.status(204).send();
  }));

  // ---- Inventory (staff) -------------------------------------------------
  r.post("/products/:id/stock", requireStaff, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const body = parse(adjustStockBody, req.body);
    const change = "set" in body ? { set: body.set } : { delta: body.delta };
    res.json(await adjustStock(id, change, body.reason, { adminId: req.admin.id }, body.note));
  }));

  r.get("/products/:id/stock-movements", requireStaff, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await listMovements(id));
  }));

  // ---- Cart ---------------------------------------------------------------
  r.get("/cart", isAuthenticated, handle(async (req, res) => {
    res.json(await storage.getCartItems(req.user.id));
  }));

  r.post("/cart", isAuthenticated, handle(async (req, res) => {
    const body = parse(addToCartBody, req.body);
    const product = await storage.getProduct(body.productId);
    if (!product) throw new HttpError("NOT_FOUND", "Product not found");
    const inCart = (await storage.getCartItems(req.user.id)).find((i) => i.productId === body.productId)?.quantity ?? 0;
    assertCartQuantity(product, Math.min(inCart + body.quantity, 99));
    res.status(201).json(await storage.addToCart({ ...body, userId: req.user.id }));
  }));

  r.put("/cart/:productId", isAuthenticated, handle(async (req, res) => {
    const { productId } = parse(productIdParam, req.params);
    const { quantity } = parse(updateCartItemBody, req.body);
    const product = await storage.getProduct(productId);
    if (!product) throw new HttpError("NOT_FOUND", "Product not found");
    assertCartQuantity(product, quantity);
    await storage.updateCartItemQuantity(req.user.id, productId, quantity);
    res.status(204).send();
  }));

  r.delete("/cart/:productId", isAuthenticated, handle(async (req, res) => {
    const { productId } = parse(productIdParam, req.params);
    await storage.removeFromCart(req.user.id, productId);
    res.status(204).send();
  }));

  r.delete("/cart", isAuthenticated, handle(async (req, res) => {
    await storage.clearCart(req.user.id);
    res.status(204).send();
  }));

  // ---- Delivery & addresses -----------------------------------------------
  r.get("/delivery/zones", handle(async (_req, res) => {
    res.json(await listZones());
  }));

  r.get("/delivery/slots", handle(async (_req, res) => {
    res.json(await listSlotAvailability());
  }));

  r.get("/addresses", isAuthenticated, handle(async (req, res) => {
    res.json(await listAddresses(req.user.id));
  }));

  r.post("/addresses", isAuthenticated, handle(async (req, res) => {
    res.status(201).json(await createAddress(req.user.id, parse(createAddressBody, req.body)));
  }));

  r.delete("/addresses/:id", isAuthenticated, handle(async (req, res) => {
    await deleteAddress(req.user.id, parse(idParam, req.params).id);
    res.status(204).send();
  }));

  r.post("/checkout/quote", isAuthenticated, handle(async (req, res) => {
    res.json(await quote(req.user.id, parse(quoteBody, req.body).addressId));
  }));

  // ---- Orders -------------------------------------------------------------
  r.get("/orders", isAuthenticated, handle(async (req, res) => {
    // Always the caller's own orders, staff included. The staff queue is /admin/orders.
    res.json(await storage.getUserOrders(req.user.id));
  }));

  r.get("/orders/:id", isAuthenticated, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const order = await storage.getOrder(id);
    // Other customers' orders are 404 (not 403) so ids can't be probed. Staff use /admin/orders/:id.
    if (!order || order.userId !== req.user.id) {
      throw new HttpError("NOT_FOUND", "Order not found");
    }
    res.json({ ...order, events: await listOrderEvents(id) });
  }));

  if (version === "v1") {
    r.post("/orders", isAuthenticated, handle(async (req, res) => {
      const key = parse(idempotencyKey, req.get(IDEMPOTENCY_HEADER));
      const body = parse(placeOrderBody, req.body);
      const { order, replayed } = await placeOrder(req.user, body, key);
      if (!replayed) await notifyOrder(order, "order_placed");
      res.status(replayed ? 200 : 201).json(order);
    }));
  } else {
    // Customers order only through the mobile app (v1). The web is for staff.
    r.post("/orders", handle(async () => {
      throw new HttpError("GONE", "Ordering is available in the FreshMart mobile app");
    }));
  }

  r.post("/orders/:id/cancel", isAuthenticated, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const body = parse(cancelOrderBody, req.body);
    const order = await cancelByCustomer(req.user, id, body?.reason);
    await notifyOrder(order, "order_cancelled");
    res.json(order);
  }));

  r.put("/orders/:id/status", requireStaff, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { status, note } = parse(updateOrderStatusBody, req.body);
    const order = await changeStatusByAdmin(req.admin, id, status, note);
    await notifyOrder(order, templateForStatus[status]);
    res.json(order);
  }));

  // ---- Support (customers) ------------------------------------------------
  r.get("/support", (_req, res) => {
    const info: SupportInfo = {
      phone: process.env.SUPPORT_PHONE || null,
      whatsapp: process.env.SUPPORT_WHATSAPP || null,
      email: process.env.SUPPORT_EMAIL || null,
      hours: process.env.SUPPORT_HOURS || null,
    };
    res.json(info);
  });

  const ownOrder = async (req: any) => {
    const { id } = parse(idParam, req.params);
    const order = await storage.getOrder(id);
    if (!order || order.userId !== req.user.id) throw new HttpError("NOT_FOUND", "Order not found");
    return order;
  };

  r.post("/orders/:id/issues", isAuthenticated, handle(async (req, res) => {
    const order = await ownOrder(req);
    const body = parse(createIssueBody, req.body);
    const [issue] = await db.insert(supportIssues).values({ ...body, orderId: order.id, userId: req.user.id }).returning();
    res.status(201).json(issue);
  }));

  // The app's Issues section: everything this customer has reported, newest first.
  r.get("/support/issues", isAuthenticated, handle(async (req, res) => {
    res.json(await db.select().from(supportIssues).where(eq(supportIssues.userId, req.user.id)).orderBy(desc(supportIssues.id)).limit(100));
  }));

  r.post("/support/issues", isAuthenticated, handle(async (req, res) => {
    const { orderId, ...body } = parse(reportIssueBody, req.body);
    if (orderId) {
      const order = await storage.getOrder(orderId);
      if (!order || order.userId !== req.user.id) throw new HttpError("NOT_FOUND", "Order not found");
    }
    const [issue] = await db.insert(supportIssues).values({ ...body, orderId: orderId ?? null, userId: req.user.id }).returning();
    res.status(201).json(issue);
  }));

  r.get("/orders/:id/issues", isAuthenticated, handle(async (req, res) => {
    const order = await ownOrder(req);
    res.json(await db.select().from(supportIssues).where(eq(supportIssues.orderId, order.id)).orderBy(desc(supportIssues.id)));
  }));

  // ---- Staff console sign-in (email + password, cookie session) ---------------
  r.post("/admin/auth/login", handle(async (req, res) => {
    const { email, password } = parse(adminLoginBody, req.body);
    const a = await loginAdmin(email, password);
    await startAdminSession(req, a);
    res.json(profile(a));
  }));

  r.post("/admin/auth/logout", handle(async (req, res) => {
    await logout(req);
    res.json({ message: "Signed out" });
  }));

  // Always the same reply, so this can't be used to find out which emails are staff.
  r.post("/admin/auth/forgot", handle(async (req, res) => {
    await requestPasswordReset(parse(adminForgotBody, req.body).email);
    res.json({ message: "If that email belongs to a staff account, a reset link is on its way." });
  }));

  // Accept an invite or finish a reset, then sign in.
  r.post("/admin/auth/set-password", handle(async (req, res) => {
    const { token, password } = parse(adminSetPasswordBody, req.body);
    const a = await setPasswordWithToken(token, password);
    await startAdminSession(req, a);
    res.json(profile(a));
  }));

  r.get("/admin/auth/me", requireStaff, handle(async (req, res) => res.json(profile(req.admin))));

  r.put("/admin/auth/password", requireStaff, handle(async (req, res) => {
    const { currentPassword, password } = parse(adminChangePasswordBody, req.body);
    await changeAdminPassword(req.admin, currentPassword, password, req);
    res.json({ message: "Password changed" });
  }));

  // ---- Staff console --------------------------------------------------------
  const staffIdParam = z.object({ id: z.string().min(1).max(64) });
  const admin = Router();
  admin.use(requireStaff);
  // Owner-only: staff accounts.
  admin.get("/staff", requireOwner, handle(async (_req, res) => res.json(await listStaff())));
  admin.post("/staff", requireOwner, handle(async (req, res) => {
    const result = await createStaff(req.admin, parse(createStaffBody, req.body));
    res.status(201).json(result);
  }));
  admin.patch("/staff/:id", requireOwner, handle(async (req, res) => {
    res.json(await updateStaff(req.admin, parse(staffIdParam, req.params).id, parse(updateStaffBody, req.body)));
  }));
  admin.post("/staff/:id/invite", requireOwner, handle(async (req, res) => {
    res.json(await resendInvite(req.admin, parse(staffIdParam, req.params).id));
  }));
  admin.get("/summary", handle(async (_req, res) => res.json(await summary())));
  admin.get("/orders", handle(async (req, res) => res.json(await listOrders(parse(adminOrdersQuery, req.query)))));
  admin.get("/orders/:id", handle(async (req, res) => res.json(await orderDetail(parse(idParam, req.params).id))));
  admin.patch("/orders/:id", handle(async (req, res) => {
    const { assignedRider } = parse(adminOrderPatchBody, req.body);
    res.json(await assignRider(parse(idParam, req.params).id, assignedRider || null, req.admin));
  }));
  admin.post("/orders/:id/transport", handle(async (req, res) => {
    const { fee, note } = parse(agreeTransportBody, req.body);
    const order = await agreeTransport(req.admin, parse(idParam, req.params).id, fee, note);
    await notifyOrder(order, "order_transport_agreed");
    res.json(order);
  }));
  admin.post("/notifications/:id/resend", handle(async (req, res) => res.json(await resendNotification(parse(idParam, req.params).id))));
  // Owner-only: categories (the app shows them in sortOrder).
  admin.get("/categories", requireOwner, handle(async (_req, res) => res.json(await listCategoriesWithCounts())));
  admin.post("/categories", requireOwner, handle(async (req, res) => res.status(201).json(await createCategory(parse(categoryBody, req.body)))));
  admin.put("/categories/order", requireOwner, handle(async (req, res) => {
    await reorderCategories(parse(categoryOrderBody, req.body).ids);
    res.json(await listCategoriesWithCounts());
  }));
  admin.patch("/categories/:id", requireOwner, handle(async (req, res) =>
    res.json(await updateCategory(parse(idParam, req.params).id, parse(categoryPatchBody, req.body)))));
  admin.delete("/categories/:id", requireOwner, handle(async (req, res) => {
    await deleteCategory(parse(idParam, req.params).id);
    res.status(204).send();
  }));
  admin.get("/delivery/zones", handle(async (_req, res) => res.json(await listAllZones())));
  admin.post("/delivery/zones", requireOwner, handle(async (req, res) => res.status(201).json(await createZone(parse(zoneBody, req.body)))));
  admin.patch("/delivery/zones/:id", requireOwner, handle(async (req, res) =>
    res.json(await updateZone(parse(idParam, req.params).id, parse(zoneBody.partial(), req.body)))));
  admin.get("/delivery/slots", handle(async (_req, res) => res.json(await listAllSlots())));
  admin.post("/delivery/slots", requireOwner, handle(async (req, res) => res.status(201).json(await createSlot(parse(slotBody, req.body)))));
  admin.patch("/delivery/slots/:id", requireOwner, handle(async (req, res) =>
    res.json(await updateSlot(parse(idParam, req.params).id, parse(slotPatchBody, req.body)))));
  admin.get("/issues", handle(async (req, res) => {
    const status = parse(z.object({ status: z.enum(["open", "resolved", "all"]).default("open") }), req.query).status;
    res.json(await listIssues(status));
  }));
  admin.patch("/issues/:id", handle(async (req, res) => {
    const body = parse(resolveIssueBody, req.body);
    res.json(await resolveIssue(parse(idParam, req.params).id, body.status, body.resolution, req.admin));
  }));
  r.use("/admin", admin);

  // Unknown API routes return JSON 404 instead of falling through to the SPA.
  r.use((_req, res) => sendError(res, "NOT_FOUND", "Route not found"));
  r.use(errorMiddleware);
  return r;
}

export function registerRoutes(app: Express): Server {
  app.use("/api/v1", buildApiRouter("v1")); // versioned API (mobile)
  app.use("/api", buildApiRouter("legacy")); // legacy alias (web)
  return createServer(app);
}
