import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const userData = await response.json();
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
