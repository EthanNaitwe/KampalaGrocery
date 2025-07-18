import { fallbackStorage } from "./fallbackStorage";
import { googleSheetsDb } from "./googleSheetsDb";
import { nanoid } from "nanoid";

// Sample data for testing
const sampleCategories = [
  { name: "Fresh Produce", icon: "🥬" },
  { name: "Dairy & Eggs", icon: "🥛" },
  { name: "Meat & Poultry", icon: "🥩" },
  { name: "Bakery", icon: "🍞" },
];

const sampleProducts = [
  {
    name: "Fresh Tomatoes",
    description: "Locally grown fresh tomatoes",
    price: "2500",
    image: "https://images.unsplash.com/photo-1546470427-e13b5da90cc4?w=400",
    categoryId: 1,
    inStock: true,
  },
  {
    name: "Organic Bananas",
    description: "Sweet organic bananas",
    price: "3000",
    image: "https://images.unsplash.com/photo-1543218024-57a70143c369?w=400",
    categoryId: 1,
    inStock: true,
  },
  {
    name: "Fresh Spinach",
    description: "Organic fresh spinach leaves",
    price: "1800",
    image: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400",
    categoryId: 1,
    inStock: true,
  },
  {
    name: "Fresh Milk",
    description: "Farm fresh milk",
    price: "4500",
    image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400",
    categoryId: 2,
    inStock: true,
  },
  {
    name: "Free Range Eggs",
    description: "Free range chicken eggs",
    price: "8000",
    image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400",
    categoryId: 2,
    inStock: true,
  },
  {
    name: "Greek Yogurt",
    description: "Creamy Greek yogurt",
    price: "3200",
    image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400",
    categoryId: 2,
    inStock: true,
  },
  {
    name: "Chicken Breast",
    description: "Fresh chicken breast",
    price: "15000",
    image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400",
    categoryId: 3,
    inStock: true,
  },
  {
    name: "Ground Beef",
    description: "Fresh ground beef",
    price: "12000",
    image: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400",
    categoryId: 3,
    inStock: true,
  },
  {
    name: "White Bread",
    description: "Fresh baked white bread",
    price: "2000",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400",
    categoryId: 4,
    inStock: true,
  },
  {
    name: "Chocolate Croissant",
    description: "Buttery chocolate croissant",
    price: "2800",
    image: "https://images.unsplash.com/photo-1555507036-db7af8d638ad?w=400",
    categoryId: 4,
    inStock: true,
  },
];

export async function seedDatabase() {
  try {
    console.log("Checking if database needs seeding...");
    
    // First, try Google Sheets, fallback to memory storage if needed
    let useGoogleSheets = true;
    
    // Check if categories already exist
    let existingCategories = [];
    try {
      existingCategories = await googleSheetsDb.getCategories();
    } catch (error) {
      console.log("Falling back to memory storage for checking categories");
      useGoogleSheets = false;
      existingCategories = await fallbackStorage.getCategories();
    }
    
    // Only seed if no categories exist
    if (existingCategories.length > 0) {
      console.log("Database already has data, skipping seeding...");
      return;
    }
    
    console.log("Seeding database with sample data...");
    
    // Create categories
    const createdCategories = [];
    for (const category of sampleCategories) {
      try {
        let createdCategory;
        if (useGoogleSheets) {
          try {
            createdCategory = await googleSheetsDb.createCategory(category);
          } catch (error) {
            console.log("Falling back to memory storage for categories");
            useGoogleSheets = false;
            createdCategory = await fallbackStorage.createCategory(category);
          }
        } else {
          createdCategory = await fallbackStorage.createCategory(category);
        }
        createdCategories.push(createdCategory);
        console.log(`Created category: ${createdCategory.name}`);
      } catch (error) {
        console.log(`Category ${category.name} might already exist, skipping...`);
      }
    }
    
    // Create products
    for (const product of sampleProducts) {
      try {
        let createdProduct;
        if (useGoogleSheets) {
          try {
            createdProduct = await googleSheetsDb.createProduct(product);
          } catch (error) {
            console.log("Falling back to memory storage for products");
            createdProduct = await fallbackStorage.createProduct(product);
          }
        } else {
          createdProduct = await fallbackStorage.createProduct(product);
        }
        console.log(`Created product: ${createdProduct.name}`);
      } catch (error) {
        console.log(`Product ${product.name} might already exist, skipping...`);
      }
    }
    
    // Create an admin user for testing
    const adminUser = {
      id: nanoid(),
      phoneNumber: "+1234567890",
      firstName: "Admin",
      lastName: "User",
      isAdmin: true,
    };
    
    try {
      let createdUser;
      if (useGoogleSheets) {
        try {
          createdUser = await googleSheetsDb.createUser(adminUser);
        } catch (error) {
          console.log("Falling back to memory storage for admin user");
          createdUser = await fallbackStorage.createUser(adminUser);
        }
      } else {
        createdUser = await fallbackStorage.createUser(adminUser);
      }
      console.log(`Created admin user: ${createdUser.phoneNumber}`);
    } catch (error) {
      console.log("Admin user might already exist, skipping...");
    }
    
    console.log("Database seeding completed successfully!");
    
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}