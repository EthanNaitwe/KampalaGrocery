# E-commerce Mobile App

A React Native mobile application for the e-commerce platform, built with Expo and featuring SMS authentication, product catalog, shopping cart, and order management.

## Features

- **SMS Authentication**: Phone number + OTP verification using Twilio
- **Product Catalog**: Browse products by categories with search functionality
- **Shopping Cart**: Add, remove, and modify items with quantity controls
- **Order Management**: View order history and status tracking
- **User Profile**: Account management and app settings
- **Responsive Design**: Optimized for both iOS and Android devices

## Tech Stack

- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and build tools
- **React Navigation**: Screen navigation and routing
- **TanStack Query**: Server state management and caching
- **React Native Paper**: Material Design components
- **TypeScript**: Type safety and better development experience

## Prerequisites

- Node.js (v16 or higher)
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (for iOS development)
- Android Studio/Emulator (for Android development)
- Expo Go app (for testing on physical devices)

## Installation

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Update API configuration in `src/utils/api.ts`:
   ```typescript
   const API_BASE_URL = 'YOUR_API_URL_HERE';
   ```

## Running the App

### Development Mode

Start the Expo development server:
```bash
npm start
```

### Platform-specific Development

- **iOS**: `npm run ios`
- **Android**: `npm run android`
- **Web**: `npm run web`

### Using Expo Go

1. Install Expo Go on your mobile device
2. Scan the QR code from the terminal or Expo DevTools
3. The app will load on your device

## Project Structure

```
mobile/
├── src/
│   ├── screens/           # Screen components
│   │   ├── LoginScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── ProductsScreen.tsx
│   │   ├── ProductDetailScreen.tsx
│   │   ├── CartScreen.tsx
│   │   ├── OrdersScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── context/           # React Context providers
│   │   └── AuthContext.tsx
│   └── utils/             # Utility functions
│       └── api.ts
├── App.tsx               # Main app component
├── app.json              # Expo configuration
└── package.json          # Dependencies and scripts
```

## API Configuration

The app connects to your backend API. Update the `API_BASE_URL` in `src/utils/api.ts`:

- **Development**: Use your local IP address (e.g., `http://192.168.1.100:5000`)
- **Production**: Use your deployed API URL

## Building for Production

### iOS

```bash
expo build:ios
```

### Android

```bash
expo build:android
```

## Key Features

### Authentication
- Phone number input with validation
- SMS OTP verification
- Secure session management
- Auto-login on app restart

### Product Management
- Category-based product browsing
- Search functionality
- Product detail views
- Price display and formatting

### Shopping Cart
- Add/remove items
- Quantity adjustment
- Real-time total calculation
- Persistent cart state

### Order Processing
- Secure checkout process
- Order history tracking
- Status updates
- Receipt generation

### User Experience
- Intuitive navigation with bottom tabs
- Material Design components
- Loading states and error handling
- Flash messages for user feedback

## Dependencies

### Core
- `react-native`: Mobile app framework
- `expo`: Development platform
- `@react-navigation/native`: Navigation
- `@tanstack/react-query`: State management

### UI/UX
- `react-native-paper`: Material Design components
- `react-native-vector-icons`: Icon library
- `react-native-flash-message`: Toast notifications

### Utilities
- `react-hook-form`: Form management
- `zod`: Schema validation
- `@react-native-async-storage/async-storage`: Local storage

## Customization

### Styling
- Modify colors in individual screen stylesheets
- Update Material Design theme in `App.tsx`
- Add custom fonts in `app.json`

### Navigation
- Add new screens in `App.tsx`
- Configure tab icons and labels
- Set up deep linking if needed

### API Integration
- Update endpoints in screen components
- Modify request/response handling in `api.ts`
- Add authentication headers as needed

## Troubleshooting

### Common Issues

1. **Metro bundler cache**: `expo start -c`
2. **iOS simulator issues**: Reset simulator and restart
3. **Android emulator problems**: Check AVD configuration
4. **Network connectivity**: Ensure API URL is accessible from device

### Debug Mode

Enable debug mode in Expo DevTools to inspect:
- Network requests
- Component state
- Navigation stack
- Performance metrics

## Contributing

1. Follow React Native best practices
2. Use TypeScript for type safety
3. Implement proper error handling
4. Add loading states for better UX
5. Test on both iOS and Android platforms

## License

This project is part of the e-commerce application suite.