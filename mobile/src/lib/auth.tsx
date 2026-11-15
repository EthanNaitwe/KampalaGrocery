import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import type { TokenResponse, UserResponse } from "@shared/api";
import { api } from "./api";
import {
  authedApi,
  clearSession,
  getRefreshToken,
  loadCachedUser,
  onSessionChange,
  refreshSession,
  saveSession,
} from "./session";

type AuthState = {
  status: "loading" | "signedOut" | "signedIn";
  user: UserResponse | null;
  requestCode: (phoneNumber: string) => Promise<void>;
  verifyCode: (phoneNumber: string, otp: string) => Promise<void>;
  signInWithPassword: (phoneNumber: string, password: string) => Promise<void>;
  /** Forgot password (or sign up with one): a code proves the number and sets the new password. */
  resetPassword: (phoneNumber: string, otp: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<UserResponse | null>(null);

  useEffect(() => {
    const unsubscribe = onSessionChange((u) => {
      setUser(u);
      setStatus(u ? "signedIn" : "signedOut");
    });

    (async () => {
      const cached = await loadCachedUser().catch(() => null);
      if (!cached) return setStatus("signedOut");
      // Show the cached user immediately (works offline), then validate in the background.
      setUser(cached);
      setStatus("signedIn");
      refreshSession().catch(() => {
        /* offline: keep cached session; the next request will retry */
      });
    })();

    return unsubscribe;
  }, []);

  const requestCode = useCallback(async (phoneNumber: string) => {
    await api("/auth/otp", { method: "POST", body: { phoneNumber } });
  }, []);

  const verifyCode = useCallback(async (phoneNumber: string, otp: string) => {
    const t = await api<TokenResponse>("/auth/token", {
      method: "POST",
      body: { phoneNumber, otp, deviceName: `FreshMart ${Platform.OS}` },
    });
    await saveSession(t);
  }, []);

  const signInWithPassword = useCallback(async (phoneNumber: string, password: string) => {
    const t = await api<TokenResponse>("/auth/password/login", {
      method: "POST",
      body: { phoneNumber, password, deviceName: `FreshMart ${Platform.OS}` },
    });
    await saveSession(t);
  }, []);

  const resetPassword = useCallback(async (phoneNumber: string, otp: string, password: string) => {
    const t = await api<TokenResponse>("/auth/password/reset", {
      method: "POST",
      body: { phoneNumber, otp, password, deviceName: `FreshMart ${Platform.OS}` },
    });
    await saveSession(t);
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    // Always clear locally, even if the server call fails (e.g. offline).
    await api("/auth/logout", { method: "POST", body: refreshToken ? { refreshToken } : {} }).catch(() => {});
    await clearSession();
  }, []);

  const deleteAccount = useCallback(async () => {
    await authedApi("/auth/account", { method: "DELETE" });
    await clearSession();
  }, []);

  const value = useMemo(
    () => ({ status, user, requestCode, verifyCode, signInWithPassword, resetPassword, signOut, deleteAccount }),
    [status, user, requestCode, verifyCode, signInWithPassword, resetPassword, signOut, deleteAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
