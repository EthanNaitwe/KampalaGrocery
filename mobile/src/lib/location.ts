import * as Location from "expo-location";

export interface Pin {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty in metres, when the device reports it. */
  accuracy: number | null;
  /** Human-readable suggestion for the address line, from reverse geocoding. */
  suggestedLine: string | null;
  /** Place names (district, city, street…) used to suggest a delivery area. */
  placeNames: string[];
  /** Kilometres from central Kampala. */
  kmFromKampala: number;
}

export type PinResult = { ok: true; pin: Pin } | { ok: false; reason: "denied" | "unavailable"; message: string };

const KAMPALA = { latitude: 0.3476, longitude: 32.5825 };

function kmBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

/** Asks for permission (foreground only) and returns the phone's current position. */
export async function pinCurrentLocation(): Promise<PinResult> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") {
    return { ok: false, reason: "denied", message: "Location permission is off. You can still type your address below." };
  }

  let pos: Location.LocationObject | null = null;
  try {
    pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 15_000);
  } catch {
    pos = await Location.getLastKnownPositionAsync().catch(() => null);
  }
  if (!pos) {
    return { ok: false, reason: "unavailable", message: "We couldn't get your location. Check that location is on, or type your address." };
  }

  const { latitude, longitude, accuracy } = pos.coords;
  let suggestedLine: string | null = null;
  let placeNames: string[] = [];
  try {
    const [g] = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 8_000);
    if (g) {
      const street = [g.streetNumber, g.street].filter(Boolean).join(" ") || g.name;
      suggestedLine = [street, g.district ?? g.subregion].filter(Boolean).join(", ") || g.formattedAddress || null;
      placeNames = [g.district, g.subregion, g.city, g.street, g.name, g.formattedAddress].filter((v): v is string => !!v);
    }
  } catch {
    // Reverse geocoding is a nice-to-have; the pin itself is what the rider needs.
  }

  return {
    ok: true,
    pin: {
      latitude: Math.round(latitude * 1e6) / 1e6,
      longitude: Math.round(longitude * 1e6) / 1e6,
      accuracy: accuracy ?? null,
      suggestedLine,
      placeNames,
      kmFromKampala: kmBetween({ latitude, longitude }, KAMPALA),
    },
  };
}

/** First delivery area whose name appears in the geocoded place names. */
export function matchZone<Z extends { id: number; name: string }>(zones: Z[], placeNames: string[]): Z | undefined {
  const hay = placeNames.join(" | ").toLowerCase();
  return zones.find((z) => hay.includes(z.name.toLowerCase()));
}

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
