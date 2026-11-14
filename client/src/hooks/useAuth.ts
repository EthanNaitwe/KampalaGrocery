import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        console.log("useAuth: Fetching user data...");
        const response = await fetch("/api/auth/user", {
          credentials: "include",
        });
        if (response.status === 401) {
          console.log("useAuth: User not authenticated (401)");
          return null;
        }

        const text = await response.text();
        let userData: any = null;
        try {
          userData = text ? JSON.parse(text) : null;
        } catch (err) {
          userData = text;
        }

        if (userData && typeof userData === 'object' && userData.message === 'User not logged in') {
          console.log('useAuth: Server reported user not logged in');
          return null;
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log("useAuth: User data fetched:", userData);
        return userData;
      } catch (error: any) {
        if (error.message?.includes('401')) {
          console.log("useAuth: User not authenticated (error 401)");
          return null;
        }
        console.error("useAuth: Error fetching user:", error);
        throw error;
      }
    },
    retry: false,
    staleTime: 0, // Always refetch when invalidated
  });

  console.log("useAuth: Current state:", { user, isLoading, isAuthenticated: !!user });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
