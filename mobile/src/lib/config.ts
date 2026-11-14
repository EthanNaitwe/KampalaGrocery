/**
 * API base URL, set per environment via EXPO_PUBLIC_API_URL (see .env.example and eas.json).
 * For a local server: Android emulator -> http://10.0.2.2:5000, physical device -> http://<your LAN IP>:5000.
 */
const raw = process.env.EXPO_PUBLIC_API_URL;

if (!raw) {
  throw new Error("EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env.local and set it.");
}

export const API_BASE_URL = `${raw.replace(/\/+$/, "")}/api/v1`;
