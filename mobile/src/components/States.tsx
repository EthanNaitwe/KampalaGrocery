import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button, styles } from "./ui";
import { errorMessage } from "@/lib/errors";
import { colors, spacing } from "@/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const center = { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md } as const;

function Badge({ icon, tone = "primary" }: { icon: IconName; tone?: "primary" | "danger" }) {
  return (
    <View
      style={{
        width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center",
        backgroundColor: tone === "danger" ? "#FDECEC" : colors.primarySoft,
      }}
    >
      <Ionicons name={icon} size={38} color={tone === "danger" ? colors.danger : colors.primary} />
    </View>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <View style={center}>
      <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={label} />
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={center}>
      <Badge icon="cloud-offline-outline" tone="danger" />
      <Text style={[styles.body, { textAlign: "center", color: colors.text }]}>{errorMessage(error)}</Text>
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon = "basket-outline",
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <View style={center}>
      <Badge icon={icon} />
      <Text style={[styles.title, { fontSize: 20, textAlign: "center" }]}>{title}</Text>
      {!!body && <Text style={[styles.body, { textAlign: "center", maxWidth: 320 }]}>{body}</Text>}
      {!!action && <View style={{ alignSelf: "center", maxWidth: 360, width: "100%", marginTop: spacing.sm }}>{action}</View>}
    </View>
  );
}
