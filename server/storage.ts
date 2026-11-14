import {
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

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateProfile(id: string, profile: { firstName?: string | null; lastName?: string | null }): Promise<User>;
  deleteAccount(id: string): Promise<void>;

  // Category operations
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;

  // Product operations
  getProducts(categoryId?: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  searchProducts(query: string): Promise<Product[]>;

  // Cart operations
  getCartItems(userId: string): Promise<(CartItem & { product: Product })[]>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItemQuantity(userId: string, productId: number, quantity: number): Promise<void>;
  removeFromCart(userId: string, productId: number): Promise<void>;
  clearCart(userId: string): Promise<void>;

  // Order operations
  getOrders(): Promise<(Order & { user: User })[]>;
  getUserOrders(userId: string): Promise<Order[]>;
  getOrder(id: number): Promise<(Order & { orderItems: Array<{ product: Product; quantity: number; price: string }> }) | undefined>;
  createOrder(order: InsertOrder, items: Array<{ productId: number; quantity: number; price: string }>): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
}

// PostgreSQL is the single durable source of truth. There is deliberately no
// in-memory fallback: if a write fails, the request must fail.
export { pgStorage as storage } from "./pgStorage.js";
