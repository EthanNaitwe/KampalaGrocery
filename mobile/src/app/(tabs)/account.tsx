import { useRouter } from "expo-router";
import { useState } from "react";
import { EmptyState } from "@/components/States";
import { Alert, ScrollView, Text } from "react-native";
import type { UserResponse } from "@shared/api";
import { Button, Field, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { authedApi, saveUser } from "@/lib/session";
import { spacing } from "@/lib/theme";

export default function AccountTab() {
  const { status } = useAuth();
  const router = useRouter();
  if (status !== "signedIn") {
    return (
      <EmptyState
        title="Your FreshMart account"
        body="Sign in with your phone number to save your cart and track orders."
        action={<Button title="Sign in" onPress={() => router.push("/sign-in")} />}
      />
    );
  }
  return <AccountScreen />;
}

function AccountScreen() {
  const { user, signOut, deleteAccount } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await authedApi<UserResponse>("/auth/me", {
        method: "PATCH",
        body: { firstName: firstName.trim() || null, lastName: lastName.trim() || null },
      });
      await saveUser(updated);
      setMessage("Saved");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete account?",
      "This permanently removes your name, phone number and cart. Past orders are kept for our records without your personal details. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteAccount().catch((e) => Alert.alert("Could not delete account", errorMessage(e))),
        },
      ],
    );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={styles.body}>Signed in as {user?.phoneNumber}</Text>
      <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
      <Field label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" error={error} />
      {!!message && <Text style={styles.body} accessibilityLiveRegion="polite">{message}</Text>}
      <Button title="Save" onPress={save} loading={saving} />
      <Button title="Sign out" onPress={() => void signOut()} variant="secondary" />
      <Button title="Delete account" onPress={confirmDelete} variant="danger" />
    </ScrollView>
  );
}
