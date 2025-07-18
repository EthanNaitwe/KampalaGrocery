# E-commerce App with SMS Authentication

## Overview
A full-stack e-commerce application built with React, Express, and PostgreSQL. Features phone-based SMS OTP authentication, product catalog with categories, shopping cart, and order management.

## Architecture
- **Web Frontend**: React with Vite, TailwindCSS, shadcn/ui components
- **Mobile App**: React Native with Expo, React Native Paper components
- **Backend**: Express.js with TypeScript
- **Database**: Google Sheets integration with fallback to PostgreSQL/in-memory storage
- **Authentication**: Phone number + SMS OTP via Twilio (both web and mobile)
- **State Management**: TanStack Query for server state (both platforms)
- **Routing**: Wouter for web, React Navigation for mobile
- **Mobile Navigation**: Bottom tabs + stack navigation with Material Design

## Recent Changes
- ✅ Successfully migrated from Replit Agent to standard Replit environment
- ✅ Implemented Google Sheets database integration with fallback storage
- ✅ Set up phone-based SMS OTP authentication with Twilio
- ✅ Added comprehensive sample data (4 categories, 10 products, admin user)
- ✅ Verified full application functionality and security
- ✅ Added smart seeding system that only populates empty database
- ✅ Confirmed SMS authentication working with real phone numbers
- ✅ Fixed Vercel deployment configuration for SPA routing
- ✅ Created complete React Native mobile app conversion with Expo
- ✅ Implemented all mobile screens: Login, Home, Products, Cart, Orders, Profile
- ✅ Added React Navigation with bottom tabs and stack navigation
- ✅ Integrated TanStack Query for mobile state management
- ✅ Used React Native Paper for Material Design components

## User Preferences
- Simple, everyday language in communications
- Concise responses without excessive technical jargon
- Focus on practical implementation over theoretical discussion
- Prefers Google Sheets for database storage

## Current Status
- Project fully migrated and operational in Replit environment
- All core features tested and working
- Database seeded with sample data for testing
- SMS authentication system ready for production use