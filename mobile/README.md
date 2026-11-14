# FreshMart mobile (Expo + React Native)

Android-first customer app. Talks to the Express API at `/api/v1`. Request/response types
come from [`../shared/api.ts`](../shared/api.ts) via the `@shared/*` alias (type-only imports).

## Run locally

```sh
# 1. Start the API from the repo root
npm run dev                      # http://localhost:5000

# 2. In mobile/
npm install
cp .env.example .env.local       # set EXPO_PUBLIC_API_URL
npx expo start                   # press "a" for an Android emulator
```

`EXPO_PUBLIC_API_URL` must be reachable from the device: `http://10.0.2.2:5000` for the Android
emulator, `http://<your-LAN-IP>:5000` for a physical phone.

## Checks

```sh
npm run typecheck
npx expo-doctor
```

## Builds (EAS)

Profiles are in `eas.json` (`development`, `preview` = installable APK, `production`).
Set the staging/production API URLs there before building:

```sh
npx eas-cli@latest build --profile preview --platform android
```

App ID: `com.kampalagrocery.app` (can be changed freely until the first Play Store upload).
