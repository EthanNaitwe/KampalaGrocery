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
import { nanoid } from "nanoid";

// In-memory storage with sample data as fallback
let users: User[] = [];
let otpVerifications: any[] = [];
let categories: Category[] = [
  {
    id: 1,
    name: "Fresh Produce",
    icon: "🥬",
    createdAt: new Date(),
  },
  {
    id: 2,
    name: "Dairy & Eggs",
    icon: "🥛",
    createdAt: new Date(),
  },
  {
    id: 3,
    name: "Meat & Poultry",
    icon: "🥩",
    createdAt: new Date(),
  },
  {
    id: 4,
    name: "Bakery",
    icon: "🍞",
    createdAt: new Date(),
  },
];

let products: Product[] = [
  {
    id: 1,
    name: "Fresh Tomatoes",
    description: "Locally grown fresh tomatoes",
    price: "2500",
    image: "https://images.unsplash.com/photo-1546470427-e13b5da90cc4?w=400",
    categoryId: 1,
    inStock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    name: "Organic Bananas",
    description: "Sweet organic bananas",
    price: "3000",
    image: "https://images.unsplash.com/photo-1543218024-57a70143c369?w=400",
    categoryId: 1,
    inStock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    name: "Fresh Milk",
    description: "Farm fresh milk",
    price: "4500",
    image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400",
    categoryId: 2,
    inStock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 4,
    name: "Free Range Eggs",
    description: "Free range chicken eggs",
    price: "8000",
    image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400",
    categoryId: 2,
    inStock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 5,
    name: "Chicken Breast",
    description: "Fresh chicken breast",
    price: "15000",
    image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400",
    categoryId: 3,
    inStock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 6,
    name: "White Bread",
    description: "Fresh baked white bread",
    price: "2000",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400",
    categoryId: 4,
    inStock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

let orders: Order[] = [];
let orderItems: any[] = [];
let cartItems: CartItem[] = [];
let sessions: any[] = [];

// Helper functions
function findIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  return arr.findIndex(predicate);
}

function generateId<T extends { id: number }>(arr: T[]): number {
  return arr.length > 0 ? Math.max(...arr.map(item => item.id)) + 1 : 1;
}

export const fallbackStorage = {
  // Users
  async getUsers() {
    return users;
  },
  
  async getUserById(id: string) {
    return users.find(user => user.id === id);
  },
  
  async getUserByPhone(phoneNumber: string) {
    return users.find(user => user.phoneNumber === phoneNumber);
  },
  
  async createUser(userData: any) {
    const id = userData.id || nanoid();
    const now = new Date();
    const user: User = {
      id,
      phoneNumber: userData.phoneNumber,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      isAdmin: userData.isAdmin || false,
      createdAt: now,
      updatedAt: now,
    };
    
    users.push(user);
    return user;
  },
  
  async updateUser(id: string, userData: any) {
    const index = findIndex(users, u => u.id === id);
    if (index === -1) throw new Error('User not found');
    
    const updated = {
      ...users[index],
      ...userData,
      updatedAt: new Date(),
    };
    
    users[index] = updated;
    return updated;
  },
  
  // OTP Verifications
  async createOtpVerification(data: any) {
    const otp = {
      id: Date.now().toString(),
      phoneNumber: data.phoneNumber,
      otp: data.otp,
      expiresAt: data.expiresAt,
      verified: false,
      createdAt: new Date(),
    };
    
    otpVerifications.push(otp);
    return otp;
  },
  
  async getOtpVerification(phoneNumber: string, otp: string) {
    const now = new Date();
    return otpVerifications.find(v => 
      v.phoneNumber === phoneNumber && 
      v.otp === otp && 
      !v.verified &&
      v.expiresAt > now
    );
  },
  
  async updateOtpVerification(id: string, updates: any) {
    const index = findIndex(otpVerifications, v => v.id === id);
    if (index === -1) throw new Error('OTP verification not found');
    
    otpVerifications[index] = { ...otpVerifications[index], ...updates };
    return otpVerifications[index];
  },
  
  // Categories
  async getCategories() {
    return [...categories];
  },
  
  async createCategory(categoryData: any) {
    const category: Category = {
      id: generateId(categories),
      name: categoryData.name,
      icon: categoryData.icon || null,
      createdAt: new Date(),
    };
    
    categories.push(category);
    return category;
  },
  
  // Products
  async getProducts(categoryId?: number) {
    if (categoryId) {
      return products.filter(p => p.categoryId === categoryId);
    }
    return [...products];
  },
  
  async getProductById(id: number) {
    return products.find(p => p.id === id);
  },
  
  async createProduct(productData: any) {
    const product: Product = {
      id: generateId(products),
      name: productData.name,
      description: productData.description || null,
      price: productData.price,
      image: productData.image || null,
      categoryId: productData.categoryId || null,
      inStock: productData.inStock !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    products.push(product);
    return product;
  },
  
  async updateProduct(id: number, productData: any) {
    const index = findIndex(products, p => p.id === id);
    if (index === -1) throw new Error('Product not found');
    
    const updated = {
      ...products[index],
      ...productData,
      updatedAt: new Date(),
    };
    
    products[index] = updated;
    return updated;
  },
  
  async deleteProduct(id: number) {
    const index = findIndex(products, p => p.id === id);
    if (index === -1) throw new Error('Product not found');
    
    products.splice(index, 1);
  },
  
  async searchProducts(query: string) {
    const searchTerm = query.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm) ||
      (p.description && p.description.toLowerCase().includes(searchTerm))
    );
  },
  
  // Cart Items
  async getCartItems(userId: string) {
    const userCartItems = cartItems.filter(item => item.userId === userId);
    
    return userCartItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        ...item,
        product: product || null,
      };
    });
  },
  
  async addToCart(cartItemData: any) {
    const existingIndex = findIndex(cartItems, item => 
      item.userId === cartItemData.userId && 
      item.productId === cartItemData.productId
    );
    
    if (existingIndex !== -1) {
      // Update existing item
      const updated = {
        ...cartItems[existingIndex],
        quantity: cartItems[existingIndex].quantity + cartItemData.quantity,
      };
      
      cartItems[existingIndex] = updated;
      return updated;
    } else {
      // Add new item
      const newItem: CartItem = {
        id: generateId(cartItems),
        userId: cartItemData.userId,
        productId: cartItemData.productId,
        quantity: cartItemData.quantity,
        createdAt: new Date(),
      };
      
      cartItems.push(newItem);
      return newItem;
    }
  },
  
  async updateCartItemQuantity(userId: string, productId: number, quantity: number) {
    const index = findIndex(cartItems, item => 
      item.userId === userId && item.productId === productId
    );
    
    if (index === -1) throw new Error('Cart item not found');
    
    if (quantity <= 0) {
      cartItems.splice(index, 1);
    } else {
      cartItems[index].quantity = quantity;
    }
  },
  
  async removeFromCart(userId: string, productId: number) {
    const index = findIndex(cartItems, item => 
      item.userId === userId && item.productId === productId
    );
    
    if (index !== -1) {
      cartItems.splice(index, 1);
    }
  },
  
  async clearCart(userId: string) {
    cartItems = cartItems.filter(item => item.userId !== userId);
  },
  
  // Orders
  async getOrders() {
    return orders.map(order => {
      const user = users.find(u => u.id === order.userId);
      return {
        ...order,
        user: user || null,
      };
    });
  },
  
  async getUserOrders(userId: string) {
    return orders.filter(order => order.userId === userId);
  },
  
  async getOrderById(id: number) {
    const order = orders.find(o => o.id === id);
    if (!order) return null;
    
    const items = orderItems
      .filter(item => item.orderId === id)
      .map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          product: product || null,
          quantity: item.quantity,
          price: item.price,
        };
      });
    
    return {
      ...order,
      orderItems: items,
    };
  },
  
  async createOrder(orderData: any, orderItemsData: any[]) {
    const order: Order = {
      id: generateId(orders),
      userId: orderData.userId,
      status: orderData.status || 'pending',
      total: orderData.total,
      customerEmail: orderData.customerEmail || null,
      customerPhone: orderData.customerPhone || null,
      deliveryAddress: orderData.deliveryAddress || null,
      notes: orderData.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    orders.push(order);
    
    // Add order items
    for (const item of orderItemsData) {
      orderItems.push({
        id: generateId(orderItems),
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      });
    }
    
    // Clear cart
    cartItems = cartItems.filter(item => item.userId !== orderData.userId);
    
    return order;
  },
  
  async updateOrderStatus(id: number, status: string) {
    const index = findIndex(orders, o => o.id === id);
    if (index === -1) throw new Error('Order not found');
    
    const updated = {
      ...orders[index],
      status,
      updatedAt: new Date(),
    };
    
    orders[index] = updated;
    return updated;
  },
  
  // Sessions
  async createSession(sessionData: any) {
    sessions.push(sessionData);
  },
  
  async getSession(sid: string) {
    return sessions.find(s => s.sid === sid);
  },
  
  async updateSession(sid: string, sessionData: any) {
    const index = findIndex(sessions, s => s.sid === sid);
    
    if (index === -1) {
      sessions.push(sessionData);
    } else {
      sessions[index] = sessionData;
    }
  },
  
  async deleteSession(sid: string) {
    const index = findIndex(sessions, s => s.sid === sid);
    if (index !== -1) {
      sessions.splice(index, 1);
    }
  },
};