import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { UserResponse } from "@shared/api";
import { EmptyState } from "@/components/States";
import { Button, Field, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { authedApi, saveUser } from "@/lib/session";
import { colors, radius, shadow, spacing } from "@/lib/theme";

export default function AccountTab() {
  const { status } = useAuth();
  const router = useRouter();
  if (status !== "signedIn") {
    return (
      <EmptyState
        icon="person-outline"
        title="Your FreshMart account"
        body="Sign in with your phone number to save your cart and track orders."
        action={<Button title="Sign in" onPress={() => router.push("/sign-in")} />}
      />
    );
  }
  return <AccountScreen />;
}

function MenuRow({ icon, label, onPress, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.menuRow, !last && s.menuDivider, pressed && { opacity: 0.6 }]}
    >
      <View style={s.menuIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <Text style={s.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function AccountScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const initials = (displayName.match(/\b\p{L}/gu) ?? []).slice(0, 2).join("").toUpperCase();
  const dirty = (firstName.trim() || null) !== (user?.firstName ?? null) || (lastName.trim() || null) !== (user?.lastName ?? null);

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
      "This permanently removes your name, phone number, addresses and cart. Past orders are kept for our records without your personal details. This cannot be undone.",
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
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 }} keyboardShouldPersistTaps="handled">
      <View style={[s.card, s.profile, shadow]}>
        <View style={s.avatar}>
          {initials ? <Text style={s.avatarText}>{initials}</Text> : <Ionicons name="person" size={30} color={colors.primary} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{displayName || "Add your name"}</Text>
          <Text style={styles.body}>{user?.phoneNumber}</Text>
        </View>
      </View>

      <View style={[s.card, shadow]}>
        <Text style={s.h}>Your details</Text>
        <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" maxLength={100} />
        <Field label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" maxLength={100} error={error} />
        {!!message && !dirty && <Text style={[styles.body, { color: colors.primary }]} accessibilityLiveRegion="polite">{message}</Text>}
        <Button title="Save" onPress={save} loading={saving} disabled={!dirty} />
      </View>

      <View style={[s.card, { paddingVertical: spacing.xs }, shadow]}>
        <MenuRow icon="receipt-outline" label="My orders" onPress={() => router.navigate("/orders")} />
        <MenuRow icon="help-circle-outline" label="Help & support" onPress={() => router.push("/help")} last />
      </View>

      <Button title="Sign out" onPress={() => void signOut()} variant="secondary" />
      <Pressable onPress={confirmDelete} accessibilityRole="button" style={{ alignSelf: "center", padding: spacing.sm }}>
        <Text style={{ color: colors.danger, fontWeight: "600" }}>Delete account</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  profile: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: 24, fontWeight: "800" },
  name: { fontSize: 19, fontWeight: "700", color: colors.text },
  h: { fontSize: 17, fontWeight: "700", color: colors.text },
  menuRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  menuDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  menuIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 16, color: colors.text, fontWeight: "500" },
});
