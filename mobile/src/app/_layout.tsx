import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/States";
import { shouldRetry } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { userScopedKeys } from "@/lib/queries";
import { colors } from "@/lib/theme";

function RootStack() {
  const { status } = useAuth();
  const client = useQueryClient();

  // Drop per-user data when the session ends so the next user never sees it.
  useEffect(() => {
    if (status === "signedOut") userScopedKeys.forEach((queryKey) => client.removeQueries({ queryKey }));
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
      <Stack.Screen name="help" options={{ title: "Help & support" }} />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
        <Stack.Screen name="address/new" options={{ title: "New address", presentation: "modal" }} />
        <Stack.Screen name="orders/[id]" options={{ title: "Order" }} />
        <Stack.Screen name="password" options={{ title: "Password", presentation: "modal" }} />
        <Stack.Screen name="report" options={{ title: "Report a problem", presentation: "modal" }} />
        <Stack.Screen name="issues" options={{ title: "My issues" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
        <Stack.Screen name="verify" options={{ title: "Verify", presentation: "modal" }} />
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
