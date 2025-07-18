# E-commerce App with SMS Authentication

A full-stack e-commerce application with phone-based SMS OTP authentication, built with React, Express, and Google Sheets as the database.

## Features

- 📱 SMS-based authentication using Twilio
- 🛍️ Product catalog with categories
- 🛒 Shopping cart functionality
- 📋 Order management
- 📊 Google Sheets as database with fallback storage
- 🔐 Admin panel for product management
- 📱 Responsive design with TailwindCSS

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS, shadcn/ui
- **Backend**: Express.js, TypeScript
- **Database**: Google Sheets API with in-memory fallback
- **Authentication**: SMS OTP via Twilio
- **State Management**: TanStack Query
- **Routing**: Wouter

## Environment Variables

Create a `.env` file with the following variables:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# Google Sheets Configuration
GOOGLE_SHEETS_SPREADSHEET_ID=your_google_sheets_id
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account_email
GOOGLE_SHEETS_PRIVATE_KEY=your_service_account_private_key

# Session Secret
SESSION_SECRET=your_session_secret
```

## Deployment

### Vercel Deployment

1. Connect your repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically

### Replit Deployment

1. Use the built-in Replit deployment feature
2. Configure environment variables in Replit Secrets
3. Deploy with one click

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:5000

## API Endpoints

### Authentication
- `POST /api/auth/send-otp` - Send OTP to phone number
- `POST /api/auth/verify-otp` - Verify OTP and login
- `GET /api/auth/user` - Get current user
- `POST /api/auth/logout` - Logout user

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category (admin only)

### Cart
- `GET /api/cart` - Get user's cart
- `POST /api/cart` - Add item to cart
- `PUT /api/cart/:id` - Update cart item quantity
- `DELETE /api/cart/:id` - Remove item from cart

### Orders
- `GET /api/orders` - Get all orders (admin only)
- `POST /api/orders` - Create order
- `GET /api/orders/user` - Get user's orders
- `PUT /api/orders/:id/status` - Update order status (admin only)

## License

MIT