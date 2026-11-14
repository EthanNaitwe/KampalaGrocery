import { and, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import {
  users,
  categories,
  products,
  orders,
  orderItems,
  cartItems,
  otpVerifications,
  refreshTokens,
  type User,
  type UpsertUser,
  type Category,
  type InsertCategory,
  type Product,
  type InsertProduct,
  type Order,
  type InsertOrder,
  type CartItem,
  type InsertCartItem,
} from "../shared/schema.js";
import type { IStorage } from "./storage.js";

type OrderLine = { productId: number; quantity: number; price: string };

export class PostgresStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    return row;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const { id, createdAt, ...updatable } = userData;
    const [row] = await db
      .insert(users)
      .values({ ...userData, id: id || nanoid() })
      .onConflictDoUpdate({
        target: users.phoneNumber,
        set: { ...updatable, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async updateProfile(id: string, profile: { firstName?: string | null; lastName?: string | null }): Promise<User> {
    const [row] = await db.update(users).set({ ...profile, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    if (!row) throw new Error("User not found");
    return row;
  }

  /**
   * Erases personal data while keeping order records (needed for accounting/refunds).
   * The phone/email is replaced so it can be used to register a fresh account.
   */
  async deleteAccount(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(cartItems).where(eq(cartItems.userId, id));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, id));
      await tx
        .update(users)
        .set({ phoneNumber: `deleted:${id}`, firstName: null, lastName: null, deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, id));
      await tx.execute(sql`delete from sessions where sess->>'userId' = ${id}`);
    });
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(categories.id);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [row] = await db.insert(categories).values(category).returning();
    return row;
  }

  // Products
  async getProducts(categoryId?: number): Promise<Product[]> {
    const q = db.select().from(products);
    return categoryId
      ? q.where(eq(products.categoryId, categoryId)).orderBy(products.id)
      : q.orderBy(products.id);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [row] = await db.select().from(products).where(eq(products.id, id));
    return row;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [row] = await db.insert(products).values(product).returning();
    return row;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const [row] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    if (!row) throw new Error("Product not found");
    return row;
  }

  async deleteProduct(id: number): Promise<void> {
    const deleted = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
    if (deleted.length === 0) throw new Error("Product not found");
  }

  async searchProducts(query: string): Promise<Product[]> {
    const term = `%${query.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    return db
      .select()
      .from(products)
      .where(or(ilike(products.name, term), ilike(products.description, term)))
      .orderBy(products.id);
  }

  // Cart
  async getCartItems(userId: string): Promise<(CartItem & { product: Product })[]> {
    const rows = await db
      .select({ item: cartItems, product: products })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, userId))
      .orderBy(cartItems.id);
    return rows.map((r) => ({ ...r.item, product: r.product }));
  }

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    // Same semantics as the Sheets adapter: adding an existing product increments quantity.
    const [row] = await db
      .insert(cartItems)
      .values(cartItem)
      .onConflictDoUpdate({
        target: [cartItems.userId, cartItems.productId],
        set: { quantity: sql`${cartItems.quantity} + excluded.quantity` },
      })
      .returning();
    return row;
  }

  async updateCartItemQuantity(userId: string, productId: number, quantity: number): Promise<void> {
    await db
      .update(cartItems)
      .set({ quantity })
      .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
  }

  async removeFromCart(userId: string, productId: number): Promise<void> {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  // Orders
  async getOrders(): Promise<(Order & { user: User })[]> {
    const rows = await db
      .select({ order: orders, user: users })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .orderBy(desc(orders.createdAt));
    return rows.map((r) => ({ ...r.order, user: r.user }));
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async getOrder(
    id: number,
  ): Promise<(Order & { orderItems: Array<{ product: Product; quantity: number; price: string }> }) | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    const lines = await db
      .select({ product: products, quantity: orderItems.quantity, price: orderItems.price })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, id))
      .orderBy(orderItems.id);
    return { ...order, orderItems: lines };
  }

  async createOrder(order: InsertOrder, items: OrderLine[]): Promise<Order> {
    // Order header and lines are written atomically: either the whole order exists or none of it.
    return db.transaction(async (tx) => {
      const [created] = await tx.insert(orders).values(order).returning();
      if (items.length > 0) {
        await tx.insert(orderItems).values(items.map((i) => ({ ...i, orderId: created.id })));
      }
      return created;
    });
  }

  // OTP
  async createOtpVerification(data: { phoneNumber: string; otp: string; expiresAt: Date }): Promise<void> {
    await db.insert(otpVerifications).values({ ...data, verified: false });
  }

  /** Atomically marks a matching, unexpired, unused OTP as used. Returns false if none matched. */
  async consumeOtp(phoneNumber: string, otp: string): Promise<boolean> {
    const rows = await db
      .update(otpVerifications)
      .set({ verified: true })
      .where(
        and(
          eq(otpVerifications.phoneNumber, phoneNumber),
          eq(otpVerifications.otp, otp),
          eq(otpVerifications.verified, false),
          gt(otpVerifications.expiresAt, new Date()),
        ),
      )
      .returning({ id: otpVerifications.id });
    return rows.length > 0;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const [row] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    if (!row) throw new Error("Order not found");
    return row;
  }
}

export const pgStorage = new PostgresStorage();
