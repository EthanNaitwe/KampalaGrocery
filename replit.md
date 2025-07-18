# E-commerce App with SMS Authentication

## Overview
A full-stack e-commerce application built with React, Express, and PostgreSQL. Features phone-based SMS OTP authentication, product catalog with categories, shopping cart, and order management.

## Architecture
- **Frontend**: React with Vite, TailwindCSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Phone number + SMS OTP via Twilio
- **State Management**: TanStack Query for server state
- **Routing**: Wouter for client-side routing

## Recent Changes
- Migrating from Replit Auth to phone-based SMS OTP authentication
- Installing Twilio for SMS functionality
- Implementing new authentication flow: phone number → SMS OTP → session creation

## User Preferences
- Simple, everyday language in communications
- Concise responses without excessive technical jargon
- Focus on practical implementation over theoretical discussion

## Next Steps
- Complete SMS OTP authentication implementation
- Update frontend authentication components
- Test the full authentication flow