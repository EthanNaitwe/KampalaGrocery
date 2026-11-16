import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import type { PasswordStatus } from "@shared/api";
import { ErrorState, Loading } from "@/components/States";
import { Button, PasswordField, styles } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { authedApi } from "@/lib/session";
import { colors } from "@/lib/theme";

/** Set a password (first time) or change it. Sign-in with a code keeps working either way. */
export default function PasswordScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["password"], queryFn: () => authedApi<PasswordStatus>("/auth/password") });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (status.isLoading) return <Loading label="Loading" />;
  if (status.error) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  const has = !!status.data?.hasPassword;

  const save = async () => {
    if (has && !current) return setError("Enter your current password");
    if (next.length < 8) return setError("Use at least 8 characters");
    if (next !== confirm) return setError("The new passwords don't match");
    setError(null);
    setSaving(true);
    try {
      await authedApi("/auth/password", {
        method: "PUT",
        body: has ? { currentPassword: current, password: next } : { password: next },
      });
      qc.setQueryData<PasswordStatus>(["password"], { hasPassword: true });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.screen, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">{has ? "Change password" : "Set a password"}</Text>
        <Text style={styles.body}>
          {has
            ? "You can sign in with your password, or with a code we send you."
            : "Add a password to sign in without waiting for a code. Codes keep working too."}
        </Text>
        {has && (
          <PasswordField label="Current password" value={current} onChangeText={setCurrent} autoComplete="current-password" textContentType="password" />
        )}
        <PasswordField
          label="New password"
          value={next}
          onChangeText={setNext}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
          returnKeyType="done"
          onSubmitEditing={save}
          error={error}
        />
        <Button title="Save password" onPress={save} loading={saving} disabled={!next || !confirm} />
        {has && (
          <Text style={styles.body}>Forgot it? Sign out, choose Password, then "Forgot password".</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
