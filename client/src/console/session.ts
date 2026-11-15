import { useQuery } from "@tanstack/react-query";
import type { AdminProfile } from "@shared/api";
import { queryClient } from "@/lib/queryClient";

export const SESSION_KEY = ["admin-session"] as const;

/** Signed-in staff member, or null when signed out. */
export function useAdmin() {
  const { data, isLoading } = useQuery<AdminProfile | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as AdminProfile;
    },
    retry: false,
    staleTime: 60_000,
  });
  const admin = data ?? null;
  return { admin, isLoading, isOwner: admin?.role === "owner" };
}

export function setSession(admin: AdminProfile | null) {
  if (!admin) queryClient.clear();
  queryClient.setQueryData(SESSION_KEY, admin);
}

export async function signOut() {
  await fetch("/api/v1/admin/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  setSession(null);
}
