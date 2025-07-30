import { google } from 'googleapis';
import { nanoid } from 'nanoid';

// Initialize Google Sheets API
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL!,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY!.replace(/\\n/g, '\n').replace(/"/g, ''),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;

// Sheet names for each table
const SHEET_NAMES = {
  users: 'users',
  otpVerifications: 'otp_verifications',
  categories: 'categories',
  products: 'products',
  orders: 'orders',
  orderItems: 'order_items',
  cartItems: 'cart_items',
  sessions: 'sessions',
};

// Helper function to ensure sheet exists
async function ensureSheetExists(sheetName: string, headers: string[]) {
  try {
    // Check if sheet exists
    const sheetsResponse = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const sheetExists = sheetsResponse.data.sheets?.some(
      sheet => sheet.properties?.title === sheetName
    );
    
    if (!sheetExists) {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          }],
        },
      });
      
      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers],
        },
      });
    }
  } catch (error) {
    console.error(`Error ensuring sheet ${sheetName} exists:`, error);
    throw error;
  }
}

// Helper function to get all rows from a sheet with retry logic
async function getSheetData(sheetName: string): Promise<any[]> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
    });
    
    const rows = response.data.values || [];
    if (rows.length === 0) return [];
    
    const headers = rows[0];
    return rows.slice(1).map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });
  } catch (error) {
    console.error(`Error getting data from sheet ${sheetName}:`, error);
    // If quota exceeded, throw error to trigger fallback
    if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 429) {
      throw new Error('Google Sheets quota exceeded');
    }
    return [];
  }
}

// Helper function to append row to sheet
async function appendToSheet(sheetName: string, values: any[]) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [values],
      },
    });
  } catch (error) {
    console.error(`Error appending to sheet ${sheetName}:`, error);
    throw error;
  }
}

// Helper function to update row in sheet
async function updateSheetRow(sheetName: string, rowIndex: number, values: any[]) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A${rowIndex + 2}:${String.fromCharCode(64 + values.length)}${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [values],
      },
    });
  } catch (error) {
    console.error(`Error updating row in sheet ${sheetName}:`, error);
    throw error;
  }
}

// Helper function to delete row from sheet
async function deleteSheetRow(sheetName: string, rowIndex: number) {
  try {
    const sheetId = await getSheetId(sheetName);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex + 1,
              endIndex: rowIndex + 2,
            },
          },
        }],
      },
    });
  } catch (error) {
    console.error(`Error deleting row from sheet ${sheetName}:`, error);
    throw error;
  }
}

// Helper function to get sheet ID
async function getSheetId(sheetName: string): Promise<number> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  
  const sheet = response.data.sheets?.find(
    sheet => sheet.properties?.title === sheetName
  );
  
  return sheet?.properties?.sheetId || 0;
}

// Initialize all sheets
export async function initializeSheets() {
  try {
    await ensureSheetExists(SHEET_NAMES.users, [
      'id', 'phoneNumber', 'firstName', 'lastName', 'isAdmin', 'createdAt', 'updatedAt'
    ]);
    
    await ensureSheetExists(SHEET_NAMES.otpVerifications, [
      'id', 'phoneNumber', 'otp', 'expiresAt', 'verified', 'createdAt'
    ]);
    
    await ensureSheetExists(SHEET_NAMES.categories, [
      'id', 'name', 'icon', 'createdAt'
    ]);
    
    await ensureSheetExists(SHEET_NAMES.products, [
      'id', 'name', 'description', 'price', 'image', 'categoryId', 'inStock', 'createdAt', 'updatedAt'
    ]);
    
    await ensureSheetExists(SHEET_NAMES.orders, [
      'id', 'userId', 'status', 'total', 'customerEmail', 'customerPhone', 'deliveryAddress', 'notes', 'createdAt', 'updatedAt'
    ]);
    
    await ensureSheetExists(SHEET_NAMES.orderItems, [
      'id', 'orderId', 'productId', 'quantity', 'price'
    ]);
    
    await ensureSheetExists(SHEET_NAMES.cartItems, [
      'id', 'userId', 'productId', 'quantity', 'createdAt'
    ]);
    
    await ensureSheetExists(SHEET_NAMES.sessions, [
      'sid', 'sess', 'expire'
    ]);
    
    console.log('All Google Sheets initialized successfully');
  } catch (error) {
    console.error('Error initializing Google Sheets:', error);
    throw error;
  }
}

// Database operations
export const googleSheetsDb = {
  // Users
  async getUsers() {
    const data = await getSheetData(SHEET_NAMES.users);
    return data.map(row => ({
      ...row,
      isAdmin: row.isAdmin === 'true',
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  },
  
  async getUserById(id: string) {
    const users = await this.getUsers();
    return users.find(user => user.id === id);
  },
  
  async getUserByPhone(phoneNumber: string) {
    const users = await this.getUsers();
    return users.find(user => user.phoneNumber === phoneNumber);
  },
  
  async createUser(userData: any) {
    const id = userData.id || nanoid();
    const now = new Date().toISOString();
    const values = [
      id,
      userData.phoneNumber,
      userData.firstName || '',
      userData.lastName || '',
      userData.isAdmin ? 'true' : 'false',
      now,
      now
    ];
    
    await appendToSheet(SHEET_NAMES.users, values);
    return {
      id,
      phoneNumber: userData.phoneNumber,
      firstName: userData.firstName,
      lastName: userData.lastName,
      isAdmin: userData.isAdmin || false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  },
  
  async updateUser(id: string, userData: any) {
    const users = await getSheetData(SHEET_NAMES.users);
    const userIndex = users.findIndex(user => user.id === id);
    
    if (userIndex === -1) throw new Error('User not found');
    
    const existingUser = users[userIndex];
    const updatedUser = {
      ...existingUser,
      ...userData,
      updatedAt: new Date().toISOString(),
    };
    
    const values = [
      updatedUser.id,
      updatedUser.phoneNumber,
      updatedUser.firstName || '',
      updatedUser.lastName || '',
      updatedUser.isAdmin ? 'true' : 'false',
      updatedUser.createdAt,
      updatedUser.updatedAt
    ];
    
    await updateSheetRow(SHEET_NAMES.users, userIndex, values);
    return {
      ...updatedUser,
      isAdmin: updatedUser.isAdmin === 'true',
      createdAt: new Date(updatedUser.createdAt),
      updatedAt: new Date(updatedUser.updatedAt),
    };
  },
  
  // OTP Verifications
  async createOtpVerification(data: any) {
    const id = Date.now().toString();
    const values = [
      id,
      data.phoneNumber,
      data.otp,
      data.expiresAt.toISOString(),
      'false',
      new Date().toISOString()
    ];
    
    await appendToSheet(SHEET_NAMES.otpVerifications, values);
    return {
      id,
      phoneNumber: data.phoneNumber,
      otp: data.otp,
      expiresAt: data.expiresAt,
      verified: false,
      createdAt: new Date(),
    };
  },
  
  async getOtpVerification(phoneNumber: string, otp: string) {
    const data = await getSheetData(SHEET_NAMES.otpVerifications);
    const now = new Date();
    
    return data.find(row => 
      row.phoneNumber === phoneNumber && 
      row.otp === otp && 
      row.verified === 'false' &&
      new Date(row.expiresAt) > now
    );
  },
  
  async updateOtpVerification(id: string, updates: any) {
    const data = await getSheetData(SHEET_NAMES.otpVerifications);
    const index = data.findIndex(row => row.id === id);
    
    if (index === -1) throw new Error('OTP verification not found');
    
    const existing = data[index];
    const updated = { ...existing, ...updates };
    
    const values = [
      updated.id,
      updated.phoneNumber,
      updated.otp,
      updated.expiresAt,
      updated.verified ? 'true' : 'false',
      updated.createdAt
    ];
    
    await updateSheetRow(SHEET_NAMES.otpVerifications, index, values);
    return updated;
  },
  
  // Categories
  async getCategories() {
    const data = await getSheetData(SHEET_NAMES.categories);
    return data.map(row => ({
      ...row,
      id: parseInt(row.id) || 0,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
    }));
  },
  
  async createCategory(categoryData: any) {
    const categories = await getSheetData(SHEET_NAMES.categories);
    const id = categories.length > 0 ? Math.max(...categories.map(c => parseInt(c.id) || 0)) + 1 : 1;
    const now = new Date().toISOString();
    
    const values = [
      id.toString(),
      categoryData.name,
      categoryData.icon || '',
      now
    ];
    
    await appendToSheet(SHEET_NAMES.categories, values);
    return {
      id,
      name: categoryData.name,
      icon: categoryData.icon,
      createdAt: new Date(now),
    };
  },
  
  // Products
  async getProducts(categoryId?: number) {
    const data = await getSheetData(SHEET_NAMES.products);
    let products = data.map(row => ({
      ...row,
      id: parseInt(row.id) || 0,
      price: row.price,
      categoryId: parseInt(row.categoryId) || null,
      inStock: row.inStock === 'true',
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
    
    if (categoryId) {
      products = products.filter(p => p.categoryId === categoryId);
    }
    
    return products;
  },
  
  async getProductById(id: number) {
    const products = await this.getProducts();
    return products.find(p => p.id === id);
  },
  
  async createProduct(productData: any) {
    const products = await getSheetData(SHEET_NAMES.products);
    const id = products.length > 0 ? Math.max(...products.map(p => parseInt(p.id) || 0)) + 1 : 1;
    const now = new Date().toISOString();
    
    const values = [
      id.toString(),
      productData.name,
      productData.description || '',
      productData.price,
      productData.image || '',
      productData.categoryId ? productData.categoryId.toString() : '',
      productData.inStock ? 'true' : 'false',
      now,
      now
    ];
    
    await appendToSheet(SHEET_NAMES.products, values);
    return {
      id,
      name: productData.name,
      description: productData.description,
      price: productData.price,
      image: productData.image,
      categoryId: productData.categoryId,
      inStock: productData.inStock !== false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  },
  
  async updateProduct(id: number, productData: any) {
    const products = await getSheetData(SHEET_NAMES.products);
    const productIndex = products.findIndex(p => parseInt(p.id) === id);
    
    if (productIndex === -1) throw new Error('Product not found');
    
    const existing = products[productIndex];
    const updated = {
      ...existing,
      ...productData,
      updatedAt: new Date().toISOString(),
    };
    
    const values = [
      updated.id,
      updated.name,
      updated.description || '',
      updated.price,
      updated.image || '',
      updated.categoryId || '',
      updated.inStock ? 'true' : 'false',
      updated.createdAt,
      updated.updatedAt
    ];
    
    await updateSheetRow(SHEET_NAMES.products, productIndex, values);
    return {
      ...updated,
      id: parseInt(updated.id),
      categoryId: parseInt(updated.categoryId) || null,
      inStock: updated.inStock === 'true',
      createdAt: new Date(updated.createdAt),
      updatedAt: new Date(updated.updatedAt),
    };
  },
  
  async deleteProduct(id: number) {
    const products = await getSheetData(SHEET_NAMES.products);
    const productIndex = products.findIndex(p => parseInt(p.id) === id);
    
    if (productIndex === -1) throw new Error('Product not found');
    
    await deleteSheetRow(SHEET_NAMES.products, productIndex);
  },
  
  async searchProducts(query: string) {
    const products = await this.getProducts();
    const searchTerm = query.toLowerCase();
    
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm) ||
      (p.description && p.description.toLowerCase().includes(searchTerm))
    );
  },
  
  // Cart Items
  async getCartItems(userId: string) {
    const cartData = await getSheetData(SHEET_NAMES.cartItems);
    const productsData = await this.getProducts();
    
    const userCartItems = cartData.filter(item => item.userId === userId);
    
    return userCartItems.map(item => {
      const product = productsData.find(p => p.id === parseInt(item.productId));
      return {
        id: parseInt(item.id),
        userId: item.userId,
        productId: parseInt(item.productId),
        quantity: parseInt(item.quantity),
        createdAt: new Date(item.createdAt),
        product: product || null,
      };
    });
  },
  
  async addToCart(cartItemData: any) {
    const cartItems = await getSheetData(SHEET_NAMES.cartItems);
    
    // Check if item already exists
    const existingIndex = cartItems.findIndex(item => 
      item.userId === cartItemData.userId && 
      parseInt(item.productId) === cartItemData.productId
    );
    
    if (existingIndex !== -1) {
      // Update existing item
      const existing = cartItems[existingIndex];
      const newQuantity = parseInt(existing.quantity) + cartItemData.quantity;
      
      const values = [
        existing.id,
        existing.userId,
        existing.productId,
        newQuantity.toString(),
        existing.createdAt
      ];
      
      await updateSheetRow(SHEET_NAMES.cartItems, existingIndex, values);
      return {
        id: parseInt(existing.id),
        userId: existing.userId,
        productId: parseInt(existing.productId),
        quantity: newQuantity,
        createdAt: new Date(existing.createdAt),
      };
    } else {
      // Add new item
      const id = cartItems.length > 0 ? Math.max(...cartItems.map(c => parseInt(c.id) || 0)) + 1 : 1;
      const now = new Date().toISOString();
      
      const values = [
        id.toString(),
        cartItemData.userId,
        cartItemData.productId.toString(),
        cartItemData.quantity.toString(),
        now
      ];
      
      await appendToSheet(SHEET_NAMES.cartItems, values);
      return {
        id,
        userId: cartItemData.userId,
        productId: cartItemData.productId,
        quantity: cartItemData.quantity,
        createdAt: new Date(now),
      };
    }
  },
  
  async updateCartItemQuantity(userId: string, productId: number, quantity: number) {
    const cartItems = await getSheetData(SHEET_NAMES.cartItems);
    const itemIndex = cartItems.findIndex(item => 
      item.userId === userId && parseInt(item.productId) === productId
    );
    
    if (itemIndex === -1) throw new Error('Cart item not found');
    
    if (quantity <= 0) {
      await deleteSheetRow(SHEET_NAMES.cartItems, itemIndex);
    } else {
      const existing = cartItems[itemIndex];
      const values = [
        existing.id,
        existing.userId,
        existing.productId,
        quantity.toString(),
        existing.createdAt
      ];
      
      await updateSheetRow(SHEET_NAMES.cartItems, itemIndex, values);
    }
  },
  
  async removeFromCart(userId: string, productId: number) {
    const cartItems = await getSheetData(SHEET_NAMES.cartItems);
    const itemIndex = cartItems.findIndex(item => 
      item.userId === userId && parseInt(item.productId) === productId
    );
    
    if (itemIndex !== -1) {
      await deleteSheetRow(SHEET_NAMES.cartItems, itemIndex);
    }
  },
  
  async clearCart(userId: string) {
    const cartItems = await getSheetData(SHEET_NAMES.cartItems);
    const userItems = cartItems.map((item, index) => ({ item, index }))
      .filter(({ item }) => item.userId === userId)
      .reverse(); // Delete from bottom to top to maintain indices
    
    for (const { index } of userItems) {
      await deleteSheetRow(SHEET_NAMES.cartItems, index);
    }
  },
  
  // Orders
  async getOrders() {
    const ordersData = await getSheetData(SHEET_NAMES.orders);
    const usersData = await this.getUsers();
    
    return ordersData.map(order => {
      const user = usersData.find(u => u.id === order.userId);
      return {
        id: parseInt(order.id),
        userId: order.userId,
        status: order.status,
        total: order.total,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        notes: order.notes,
        createdAt: new Date(order.createdAt),
        updatedAt: new Date(order.updatedAt),
        user: user || null,
      };
    });
  },
  
  async getUserOrders(userId: string) {
    const orders = await this.getOrders();
    return orders.filter(order => order.userId === userId);
  },
  
  async getOrderById(id: number) {
    const ordersData = await getSheetData(SHEET_NAMES.orders);
    const order = ordersData.find(o => parseInt(o.id) === id);
    
    if (!order) return null;
    
    const orderItemsData = await getSheetData(SHEET_NAMES.orderItems);
    const productsData = await this.getProducts();
    
    const orderItems = orderItemsData
      .filter(item => parseInt(item.orderId) === id)
      .map(item => {
        const product = productsData.find(p => p.id === parseInt(item.productId));
        return {
          product: product || null,
          quantity: parseInt(item.quantity),
          price: item.price,
        };
      });
    
    return {
      id: parseInt(order.id),
      userId: order.userId,
      status: order.status,
      total: order.total,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      notes: order.notes,
      createdAt: new Date(order.createdAt),
      updatedAt: new Date(order.updatedAt),
      orderItems,
    };
  },
  
  async createOrder(orderData: any, orderItems: any[]) {
    const orders = await getSheetData(SHEET_NAMES.orders);
    const orderId = orders.length > 0 ? Math.max(...orders.map(o => parseInt(o.id) || 0)) + 1 : 1;
    const now = new Date().toISOString();
    
    // Create order
    const orderValues = [
      orderId.toString(),
      orderData.userId,
      orderData.status,
      orderData.total,
      orderData.customerEmail || '',
      orderData.customerPhone || '',
      orderData.deliveryAddress || '',
      orderData.notes || '',
      now,
      now
    ];
    
    await appendToSheet(SHEET_NAMES.orders, orderValues);
    
    // Create order items
    const orderItemsData = await getSheetData(SHEET_NAMES.orderItems);
    const startId = orderItemsData.length > 0 ? Math.max(...orderItemsData.map(i => parseInt(i.id) || 0)) + 1 : 1;
    
    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const itemValues = [
        (startId + i).toString(),
        orderId.toString(),
        item.productId.toString(),
        item.quantity.toString(),
        item.price
      ];
      
      await appendToSheet(SHEET_NAMES.orderItems, itemValues);
    }
    
    // Clear cart
    await this.clearCart(orderData.userId);
    
    return {
      id: orderId,
      userId: orderData.userId,
      status: orderData.status,
      total: orderData.total,
      customerEmail: orderData.customerEmail,
      customerPhone: orderData.customerPhone,
      deliveryAddress: orderData.deliveryAddress,
      notes: orderData.notes,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  },
  
  async updateOrderStatus(id: number, status: string) {
    const orders = await getSheetData(SHEET_NAMES.orders);
    const orderIndex = orders.findIndex(o => parseInt(o.id) === id);
    
    if (orderIndex === -1) throw new Error('Order not found');
    
    const existing = orders[orderIndex];
    const updated = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    
    const values = [
      updated.id,
      updated.userId,
      updated.status,
      updated.total,
      updated.customerEmail || '',
      updated.customerPhone || '',
      updated.deliveryAddress || '',
      updated.notes || '',
      updated.createdAt,
      updated.updatedAt
    ];
    
    await updateSheetRow(SHEET_NAMES.orders, orderIndex, values);
    return {
      ...updated,
      id: parseInt(updated.id),
      createdAt: new Date(updated.createdAt),
      updatedAt: new Date(updated.updatedAt),
    };
  },
  
  // Sessions (for authentication)
  async createSession(sessionData: any) {
    const values = [
      sessionData.sid,
      JSON.stringify(sessionData.sess),
      sessionData.expire.toISOString()
    ];
    
    await appendToSheet(SHEET_NAMES.sessions, values);
  },
  
  async getSession(sid: string) {
    const sessions = await getSheetData(SHEET_NAMES.sessions);
    const session = sessions.find(s => s.sid === sid);
    
    if (!session) return null;
    
    return {
      sid: session.sid,
      sess: JSON.parse(session.sess),
      expire: new Date(session.expire),
    };
  },
  
  async updateSession(sid: string, sessionData: any) {
    const sessions = await getSheetData(SHEET_NAMES.sessions);
    const sessionIndex = sessions.findIndex(s => s.sid === sid);
    
    if (sessionIndex === -1) {
      await this.createSession(sessionData);
    } else {
      const values = [
        sid,
        JSON.stringify(sessionData.sess),
        sessionData.expire.toISOString()
      ];
      
      await updateSheetRow(SHEET_NAMES.sessions, sessionIndex, values);
    }
  },
  
  async deleteSession(sid: string) {
    const sessions = await getSheetData(SHEET_NAMES.sessions);
    const sessionIndex = sessions.findIndex(s => s.sid === sid);
    
    if (sessionIndex !== -1) {
      await deleteSheetRow(SHEET_NAMES.sessions, sessionIndex);
    }
  },
};