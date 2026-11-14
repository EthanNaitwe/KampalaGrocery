import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/States";
import { shouldRetry } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { keys } from "@/lib/queries";
import { colors } from "@/lib/theme";

function RootStack() {
  const { status } = useAuth();
  const client = useQueryClient();

  // Drop per-user data when the session ends so the next user never sees it.
  useEffect(() => {
    if (status === "signedOut") client.removeQueries({ queryKey: keys.cart });
  }, [status, client]);

  if (status === "loading") return <Loading />;

  const signedIn = status === "signedIn";
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: "" }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
        <Stack.Screen name="verify" options={{ title: "Verify" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, staleTime: 60_000 },
          // Mutations (orders, cart) are never retried automatically; the user decides.
          mutations: { retry: false },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
