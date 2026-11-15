/**
 * Token handling for the mobile client.
 * - Access token: memory only (15 min lifetime).
 * - Refresh token + cached user: expo-secure-store (Android Keystore / iOS Keychain).
 * - Refresh is single-flight: concurrent callers share one request, because the server treats
 *   a second use of the same refresh token as theft and revokes the sign-in.
 */
import * as SecureStore from "expo-secure-store";
import type { TokenResponse, UserResponse } from "@shared/api";
import { api, ApiError, type RequestOptions } from "./api";

const REFRESH_KEY = "freshmart.refreshToken";
const USER_KEY = "freshmart.user";
const EXPIRY_SKEW_MS = 30_000;

/**
 * Secure storage that never throws. Android's keystore can fail on some devices and emulators
 * (e.g. after an OS update the stored key can't be decrypted). A failed read clears the entry and
 * behaves as "nothing stored"; a failed write keeps the value in memory for this app session.
 */
const memory = new Map<string, string>();
const store = {
  async get(key: string): Promise<string | null> {
    if (memory.has(key)) return memory.get(key)!;
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.warn(`Secure storage read failed for ${key}; clearing it.`, (e as Error).message);
      await SecureStore.deleteItemAsync(key).catch(() => {});
      return null;
    }
  },
  async set(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
      memory.delete(key);
    } catch (e) {
      console.warn(`Secure storage write failed for ${key}; keeping it in memory only.`, (e as Error).message);
      memory.set(key, value);
    }
  },
  async remove(key: string) {
    memory.delete(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshing: Promise<TokenResponse | null> | null = null;

type Listener = (user: UserResponse | null) => void;
const listeners = new Set<Listener>();
export function onSessionChange(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const emit = (user: UserResponse | null) => listeners.forEach((fn) => fn(user));

export async function saveSession(t: TokenResponse) {
  accessToken = t.accessToken;
  accessExpiresAt = Date.now() + t.expiresIn * 1000;
  await store.set(REFRESH_KEY, t.refreshToken);
  await saveUser(t.user);
}

export async function saveUser(user: UserResponse) {
  await store.set(USER_KEY, JSON.stringify(user));
  emit(user);
}

export async function clearSession() {
  accessToken = null;
  accessExpiresAt = 0;
  await store.remove(REFRESH_KEY);
  await store.remove(USER_KEY);
  emit(null);
}

export async function loadCachedUser(): Promise<UserResponse | null> {
  const [token, user] = await Promise.all([store.get(REFRESH_KEY), store.get(USER_KEY)]);
  if (!token || !user) return null;
  try {
    return JSON.parse(user) as UserResponse;
  } catch {
    return null;
  }
}

export const getRefreshToken = () => store.get(REFRESH_KEY);

/**
 * Returns new tokens, or null if the session is definitively over (server said 401).
 * Network failures are rethrown so an offline user is not signed out.
 */
export function refreshSession(): Promise<TokenResponse | null> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await store.get(REFRESH_KEY);
      if (!refreshToken) return null;
      const t = await api<TokenResponse>("/auth/refresh", { method: "POST", body: { refreshToken } });
      await saveSession(t);
      return t;
    } catch (e) {
      if (e instanceof ApiError && e.kind === "http" && e.status === 401) {
        await clearSession();
        return null;
      }
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function getAccessToken(): Promise<string | null> {
  if (accessToken && accessExpiresAt - EXPIRY_SKEW_MS > Date.now()) return accessToken;
  return (await refreshSession())?.accessToken ?? null;
}

const signedOut = () => new ApiError("http", "Please sign in to continue.", 401, "UNAUTHORIZED");

/** Authenticated request: attaches the access token and retries once after a refresh on 401. */
export async function authedApi<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw signedOut();
  try {
    return await api<T>(path, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
    accessToken = null;
    const fresh = (await refreshSession())?.accessToken;
    if (!fresh) throw signedOut();
    return api<T>(path, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${fresh}` } });
  }
}
