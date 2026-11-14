import { useQuery } from "@tanstack/react-query";

export type SessionUser = {
  id: string;
  phoneNumber: string;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin?: boolean | null;
};

/** Current web session user, or null when signed out. */
export function useAuth() {
  const { data: user, isLoading } = useQuery<SessionUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json().catch(() => null);
      return body && typeof body === "object" && "id" in body ? (body as SessionUser) : null;
    },
    retry: false,
    staleTime: 0,
  });
  return { user: user ?? null, isLoading, isAuthenticated: !!user };
}
