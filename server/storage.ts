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
} from "@shared/schema";
import { googleSheetsDb } from "./googleSheetsDb";
import { fallbackStorage } from "./fallbackStorage";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

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

export class GoogleSheetsStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return await googleSheetsDb.getUserById(id);
  }

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    return await googleSheetsDb.getUserByPhone(phoneNumber);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = await googleSheetsDb.getUserByPhone(userData.phoneNumber);
    
    if (existingUser) {
      return await googleSheetsDb.updateUser(existingUser.id, userData);
    } else {
      return await googleSheetsDb.createUser(userData);
    }
  }

  // Category operations
  async getCategories(): Promise<Category[]> {
    return await googleSheetsDb.getCategories();
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    return await googleSheetsDb.createCategory(category);
  }

  // Product operations
  async getProducts(categoryId?: number): Promise<Product[]> {
    return await googleSheetsDb.getProducts(categoryId);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    return await googleSheetsDb.getProductById(id);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    return await googleSheetsDb.createProduct(product);
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    return await googleSheetsDb.updateProduct(id, product);
  }

  async deleteProduct(id: number): Promise<void> {
    return await googleSheetsDb.deleteProduct(id);
  }

  async searchProducts(query: string): Promise<Product[]> {
    return await googleSheetsDb.searchProducts(query);
  }

  // Cart operations
  async getCartItems(userId: string): Promise<(CartItem & { product: Product })[]> {
    return await googleSheetsDb.getCartItems(userId);
  }

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    return await googleSheetsDb.addToCart(cartItem);
  }

  async updateCartItemQuantity(userId: string, productId: number, quantity: number): Promise<void> {
    return await googleSheetsDb.updateCartItemQuantity(userId, productId, quantity);
  }

  async removeFromCart(userId: string, productId: number): Promise<void> {
    return await googleSheetsDb.removeFromCart(userId, productId);
  }

  async clearCart(userId: string): Promise<void> {
    return await googleSheetsDb.clearCart(userId);
  }

  // Order operations
  async getOrders(): Promise<(Order & { user: User })[]> {
    return await googleSheetsDb.getOrders();
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return await googleSheetsDb.getUserOrders(userId);
  }

  async getOrder(id: number): Promise<(Order & { orderItems: Array<{ product: Product; quantity: number; price: string }> }) | undefined> {
    const order = await googleSheetsDb.getOrderById(id);
    return order === null ? undefined : order;
  }

  async createOrder(order: InsertOrder, items: Array<{ productId: number; quantity: number; price: string }>): Promise<Order> {
    return await googleSheetsDb.createOrder(order, items);
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    return await googleSheetsDb.updateOrderStatus(id, status);
  }
}

// Use fallback storage for now while Google Sheets permissions are being configured
export const storage = {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    try {
      return await googleSheetsDb.getUserById(id);
    } catch (error) {
      console.log('Using fallback storage for users');
      return await fallbackStorage.getUserById(id);
    }
  },

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    try {
      return await googleSheetsDb.getUserByPhone(phoneNumber);
    } catch (error) {
      console.log('Using fallback storage for user lookup');
      return await fallbackStorage.getUserByPhone(phoneNumber);
    }
  },

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const existingUser = await googleSheetsDb.getUserByPhone(userData.phoneNumber);
      if (existingUser) {
        return await googleSheetsDb.updateUser(existingUser.id, userData);
      } else {
        return await googleSheetsDb.createUser(userData);
      }
    } catch (error) {
      console.log('Using fallback storage for user upsert');
      const existingUser = await fallbackStorage.getUserByPhone(userData.phoneNumber);
      if (existingUser) {
        return await fallbackStorage.updateUser(existingUser.id, userData);
      } else {
        return await fallbackStorage.createUser(userData);
      }
    }
  },

  // Category operations
  async getCategories(): Promise<Category[]> {
    try {
      return await googleSheetsDb.getCategories();
    } catch (error) {
      console.log('Using fallback storage for categories');
      return await fallbackStorage.getCategories();
    }
  },

  async createCategory(category: InsertCategory): Promise<Category> {
    try {
      return await googleSheetsDb.createCategory(category);
    } catch (error) {
      console.log('Using fallback storage for category creation');
      return await fallbackStorage.createCategory(category);
    }
  },

  // Product operations
  async getProducts(categoryId?: number): Promise<Product[]> {
    try {
      return await googleSheetsDb.getProducts(categoryId);
    } catch (error) {
      console.log('Using fallback storage for products');
      return await fallbackStorage.getProducts(categoryId);
    }
  },

  async getProduct(id: number): Promise<Product | undefined> {
    try {
      return await googleSheetsDb.getProductById(id);
    } catch (error) {
      console.log('Using fallback storage for product lookup');
      return await fallbackStorage.getProductById(id);
    }
  },

  async createProduct(product: InsertProduct): Promise<Product> {
    try {
      return await googleSheetsDb.createProduct(product);
    } catch (error) {
      console.log('Using fallback storage for product creation');
      return await fallbackStorage.createProduct(product);
    }
  },

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    try {
      return await googleSheetsDb.updateProduct(id, product);
    } catch (error) {
      console.log('Using fallback storage for product update');
      return await fallbackStorage.updateProduct(id, product);
    }
  },

  async deleteProduct(id: number): Promise<void> {
    try {
      return await googleSheetsDb.deleteProduct(id);
    } catch (error) {
      console.log('Using fallback storage for product deletion');
      return await fallbackStorage.deleteProduct(id);
    }
  },

  async searchProducts(query: string): Promise<Product[]> {
    try {
      return await googleSheetsDb.searchProducts(query);
    } catch (error) {
      console.log('Using fallback storage for product search');
      return await fallbackStorage.searchProducts(query);
    }
  },

  // Cart operations
  async getCartItems(userId: string): Promise<(CartItem & { product: Product })[]> {
    try {
      return await googleSheetsDb.getCartItems(userId);
    } catch (error) {
      console.log('Using fallback storage for cart items');
      const items = await fallbackStorage.getCartItems(userId);
      // Filter out items where product is null and cast product to correct type
      return items
        .filter((item: any) => item.product !== null)
        .map((item: any) => ({
          ...item,
          product: item.product as Product
        }));
    }
  },

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    try {
      return await googleSheetsDb.addToCart(cartItem);
    } catch (error) {
      console.log('Using fallback storage for cart addition');
      return await fallbackStorage.addToCart(cartItem);
    }
  },

  async updateCartItemQuantity(userId: string, productId: number, quantity: number): Promise<void> {
    try {
      return await googleSheetsDb.updateCartItemQuantity(userId, productId, quantity);
    } catch (error) {
      console.log('Using fallback storage for cart update');
      return await fallbackStorage.updateCartItemQuantity(userId, productId, quantity);
    }
  },

  async removeFromCart(userId: string, productId: number): Promise<void> {
    try {
      return await googleSheetsDb.removeFromCart(userId, productId);
    } catch (error) {
      console.log('Using fallback storage for cart removal');
      return await fallbackStorage.removeFromCart(userId, productId);
    }
  },

  async clearCart(userId: string): Promise<void> {
    try {
      return await googleSheetsDb.clearCart(userId);
    } catch (error) {
      console.log('Using fallback storage for cart clearing');
      return await fallbackStorage.clearCart(userId);
    }
  },

  // Order operations
  async getOrders(): Promise<(Order & { user: User })[]> {
    try {
      return await googleSheetsDb.getOrders();
    } catch (error) {
      console.log('Using fallback storage for orders');
      // Filter out orders where user is null to match the expected type
      const orders = await fallbackStorage.getOrders();
      return orders.filter((order: any) => order.user !== null) as (Order & { user: User })[];
    }
  },

  async getUserOrders(userId: string): Promise<Order[]> {
    try {
      return await googleSheetsDb.getUserOrders(userId);
    } catch (error) {
      console.log('Using fallback storage for user orders');
      return await fallbackStorage.getUserOrders(userId);
    }
  },

  async getOrder(id: number): Promise<(Order & { orderItems: Array<{ product: Product; quantity: number; price: string }> }) | undefined> {
    try {
      const order = await googleSheetsDb.getOrderById(id);
      return order === null ? undefined : order;
    } catch (error) {
      console.log('Using fallback storage for order lookup');
      const order = await fallbackStorage.getOrderById(id);
      if (order === null) return undefined;
      // Filter out orderItems with null product and ensure correct types
      return {
        ...order,
        orderItems: Array.isArray(order.orderItems)
          ? order.orderItems
              .filter((item: any) => item.product !== null)
              .map((item: any) => ({
                product: item.product as Product,
                quantity: Number(item.quantity),
                price: String(item.price),
              }))
          : [],
      };
    }
  },

  async createOrder(order: InsertOrder, items: Array<{ productId: number; quantity: number; price: string }>): Promise<Order> {
    try {
      return await googleSheetsDb.createOrder(order, items);
    } catch (error) {
      console.log('Using fallback storage for order creation');
      return await fallbackStorage.createOrder(order, items);
    }
  },

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    try {
      return await googleSheetsDb.updateOrderStatus(id, status);
    } catch (error) {
      console.log('Using fallback storage for order status update');
      return await fallbackStorage.updateOrderStatus(id, status);
    }
  },
};
