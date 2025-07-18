// Vercel serverless function entry point
import express from 'express';
import { registerRoutes } from '../server/routes';
import { initializeSheets } from '../server/googleSheetsDb';
import { seedDatabase } from '../server/seedData';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS for Vercel
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes('vercel.app') || origin.includes('localhost'))) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Initialize and register routes
async function initializeApp() {
  try {
    await initializeSheets();
    await seedDatabase();
    await registerRoutes(app);
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

initializeApp();

export default app;