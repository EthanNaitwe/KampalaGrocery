import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { UserResponse } from "@shared/api";
import { EmptyState } from "@/components/States";
import { Button, Field, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { useAuthMethods, useMyIssues } from "@/lib/queries";
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
        body="Sign in to save your cart and track orders."
        action={<Button title="Sign in" onPress={() => router.push("/sign-in")} />}
      />
    );
  }
  return <AccountScreen />;
}

function MenuRow({ icon, label, onPress, last, badge }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; last?: boolean; badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.menuRow, !last && s.menuDivider, pressed && { opacity: 0.6 }]}
    >
      <View style={s.menuIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <Text style={s.menuLabel}>{label}</Text>
      {!!badge && (
        <View style={s.badge} accessibilityLabel={`${badge} open`}>
          <Text style={s.badgeText}>{badge} open</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** A phone or email on the account, or a link to add it (you can sign in with either). */
function DetailRow({ icon, label, value, addLabel, onAdd }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null; addLabel: string; onAdd?: () => void;
}) {
  return (
    <View style={s.detail}>
      <Ionicons name={icon} size={20} color={colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={s.detailLabel}>{label}</Text>
        {value ? (
          <Text style={s.detailValue} numberOfLines={1}>{value}</Text>
        ) : onAdd ? (
          <Pressable onPress={onAdd} accessibilityRole="button" hitSlop={6}>
            <Text style={s.detailAdd}>{addLabel}</Text>
          </Pressable>
        ) : (
          <Text style={s.detailValue}>Not set</Text>
        )}
      </View>
    </View>
  );
}

function AccountScreen() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const issues = useMyIssues();
  const openIssues = issues.data?.filter((i) => i.status !== "resolved").length ?? 0;
  const emailAllowed = useAuthMethods().data?.email === true;
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
          <Text style={styles.body} numberOfLines={1}>{user?.phoneNumber ?? user?.email}</Text>
        </View>
      </View>

      <View style={[s.card, shadow]}>
        <Text style={s.h}>Your details</Text>
        <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" maxLength={100} />
        <Field label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" maxLength={100} error={error} />
        {!!message && !dirty && <Text style={[styles.body, { color: colors.primary }]} accessibilityLiveRegion="polite">{message}</Text>}
        <Button title="Save" onPress={save} loading={saving} disabled={!dirty} />
      </View>

      <View style={[s.card, shadow]}>
        <Text style={s.h}>Sign-in details</Text>
        <DetailRow
          icon="call-outline"
          label="Phone"
          value={user?.phoneNumber}
          addLabel="Add phone number"
          onAdd={() => router.push({ pathname: "/link", params: { kind: "phone" } })}
        />
        {(emailAllowed || !!user?.email) && (
          <DetailRow
            icon="mail-outline"
            label="Email"
            value={user?.email}
            addLabel="Add email"
            onAdd={emailAllowed ? () => router.push({ pathname: "/link", params: { kind: "email" } }) : undefined}
          />
        )}
      </View>

      <View style={[s.card, { paddingVertical: spacing.xs }, shadow]}>
        <MenuRow icon="receipt-outline" label="My orders" onPress={() => router.navigate("/orders")} />
        <MenuRow icon="chatbubbles-outline" label="My issues" badge={openIssues} onPress={() => router.push("/issues")} />
        <MenuRow icon="lock-closed-outline" label="Password" onPress={() => router.push("/password")} />
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
  badge: { backgroundColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: colors.onPrimary, fontSize: 12, fontWeight: "700" },
  detail: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { fontSize: 16, color: colors.text, fontWeight: "500" },
  detailAdd: { fontSize: 16, color: colors.primary, fontWeight: "600" },
  menuLabel: { flex: 1, fontSize: 16, color: colors.text, fontWeight: "500" },
});
