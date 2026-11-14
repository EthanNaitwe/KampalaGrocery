import { Router, type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { pool } from "./db.js";
import { isAuthenticated, sendOTP, verifyOTP, logout, startWebSession } from "./smsAuth.js";
import { issueTokens, rotateRefreshToken, revokeRefreshToken } from "./tokens.js";
import { insertProductSchema, insertCategorySchema, sendOtpSchema, verifyOtpSchema } from "../shared/schema.js";
import {
  idParam,
  productIdParam,
  listProductsQuery,
  addToCartBody,
  updateCartItemBody,
  createOrderBody,
  updateOrderStatusBody,
  requestCodeBody,
  tokenRequestBody,
  refreshBody,
  logoutBody,
  updateProfileBody,
  type TokenResponse,
} from "../shared/api.js";
import { HttpError, errorMiddleware, handle, parse, requireAdmin, sendError } from "./http.js";

function buildApiRouter(): Router {
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

  const googleRedirectUri = () =>
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback";

  r.get("/auth/google", (_req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return sendError(res, "SERVICE_UNAVAILABLE", "Google OAuth is not configured");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleRedirectUri(),
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  r.get("/auth/google/callback", handle(async (req, res) => {
    const code = req.query.code as string | undefined;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new HttpError("SERVICE_UNAVAILABLE", "Google OAuth is not configured");
    if (!code) throw new HttpError("VALIDATION_ERROR", "Missing OAuth code");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new HttpError("UNAUTHORIZED", "Google sign-in failed");
    const tokenData = (await tokenResponse.json()) as { access_token?: string };

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userInfoResponse.ok) throw new HttpError("UNAUTHORIZED", "Google sign-in failed");
    const info = (await userInfoResponse.json()) as {
      email?: string; given_name?: string; family_name?: string; name?: string;
    };
    if (!info.email) throw new HttpError("UNAUTHORIZED", "Google account has no email");

    const user = await storage.upsertUser({
      id: info.email,
      phoneNumber: info.email,
      firstName: info.given_name || info.name?.split(" ")[0] || "Google",
      lastName: info.family_name || "",
    });

    await startWebSession(req, user);
    res.redirect("/");
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

  r.post("/categories", isAuthenticated, requireAdmin, handle(async (req, res) => {
    const body = parse(insertCategorySchema, req.body);
    res.status(201).json(await storage.createCategory(body));
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

  r.post("/products", isAuthenticated, requireAdmin, handle(async (req, res) => {
    const body = parse(insertProductSchema, req.body);
    res.status(201).json(await storage.createProduct(body));
  }));

  r.put("/products/:id", isAuthenticated, requireAdmin, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const body = parse(insertProductSchema.partial(), req.body);
    if (!(await storage.getProduct(id))) throw new HttpError("NOT_FOUND", "Product not found");
    res.json(await storage.updateProduct(id, body));
  }));

  r.delete("/products/:id", isAuthenticated, requireAdmin, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    if (!(await storage.getProduct(id))) throw new HttpError("NOT_FOUND", "Product not found");
    await storage.deleteProduct(id);
    res.status(204).send();
  }));

  // ---- Cart ---------------------------------------------------------------
  r.get("/cart", isAuthenticated, handle(async (req, res) => {
    res.json(await storage.getCartItems(req.user.id));
  }));

  r.post("/cart", isAuthenticated, handle(async (req, res) => {
    const body = parse(addToCartBody, req.body);
    const product = await storage.getProduct(body.productId);
    if (!product) throw new HttpError("NOT_FOUND", "Product not found");
    if (product.inStock === false) throw new HttpError("CONFLICT", "Product is out of stock");
    res.status(201).json(await storage.addToCart({ ...body, userId: req.user.id }));
  }));

  r.put("/cart/:productId", isAuthenticated, handle(async (req, res) => {
    const { productId } = parse(productIdParam, req.params);
    const { quantity } = parse(updateCartItemBody, req.body);
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

  // ---- Orders -------------------------------------------------------------
  r.get("/orders", isAuthenticated, handle(async (req, res) => {
    res.json(req.user.isAdmin ? await storage.getOrders() : await storage.getUserOrders(req.user.id));
  }));

  r.get("/orders/:id", isAuthenticated, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const order = await storage.getOrder(id);
    // Non-admins get 404 (not 403) for other users' orders so ids can't be probed.
    if (!order || (!req.user.isAdmin && order.userId !== req.user.id)) {
      throw new HttpError("NOT_FOUND", "Order not found");
    }
    res.json(order);
  }));

  r.post("/orders", isAuthenticated, handle(async (req, res) => {
    const body = parse(createOrderBody, req.body);
    const cartItems = await storage.getCartItems(req.user.id);
    if (cartItems.length === 0) throw new HttpError("VALIDATION_ERROR", "Cart is empty");
    const unavailable = cartItems.filter((i) => i.product.inStock === false);
    if (unavailable.length) {
      throw new HttpError("CONFLICT", "Some items are out of stock", {
        productIds: unavailable.map((i) => i.productId),
      });
    }

    // Prices and total come from the database, never from the client. Integer math avoids float drift.
    const totalCents = cartItems.reduce((sum, i) => sum + Math.round(parseFloat(i.product.price) * 100) * i.quantity, 0);
    const order = await storage.createOrder(
      { ...body, userId: req.user.id, status: "pending", total: (totalCents / 100).toFixed(2) },
      cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity, price: i.product.price })),
    );
    res.status(201).json(order);
  }));

  r.put("/orders/:id/status", isAuthenticated, requireAdmin, handle(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { status } = parse(updateOrderStatusBody, req.body);
    if (!(await storage.getOrder(id))) throw new HttpError("NOT_FOUND", "Order not found");
    res.json(await storage.updateOrderStatus(id, status));
  }));

  // Unknown API routes return JSON 404 instead of falling through to the SPA.
  r.use((_req, res) => sendError(res, "NOT_FOUND", "Route not found"));
  r.use(errorMiddleware);
  return r;
}

export function registerRoutes(app: Express): Server {
  const api = buildApiRouter();
  app.use("/api/v1", api); // versioned API (mobile)
  app.use("/api", api); // legacy alias (web)
  return createServer(app);
}
