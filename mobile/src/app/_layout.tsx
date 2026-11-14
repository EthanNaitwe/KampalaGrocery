import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { shouldRetry } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

function HeaderAction() {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  return (
    <Link href={signedIn ? "/account" : "/sign-in"} accessibilityRole="button">
      <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 16 }}>{signedIn ? "Account" : "Sign in"}</Text>
    </Link>
  );
}

function RootStack() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
      </View>
    );
  }

  const signedIn = status === "signedIn";
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Catalog is public. */}
      <Stack.Screen name="index" options={{ title: "FreshMart", headerRight: () => <HeaderAction /> }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
        <Stack.Screen name="verify" options={{ title: "Verify" }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="account" options={{ title: "Account" }} />
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
