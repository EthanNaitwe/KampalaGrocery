import { ActivityIndicator, Text, View } from "react-native";
import { Button, styles } from "./ui";
import { errorMessage } from "@/lib/errors";
import { colors, spacing } from "@/lib/theme";

const center = { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md } as const;

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <View style={center}>
      <ActivityIndicator color={colors.primary} accessibilityLabel={label} />
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={center}>
      <Text style={[styles.body, { textAlign: "center" }]}>{errorMessage(error)}</Text>
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View style={center}>
      <Text style={[styles.title, { fontSize: 20, textAlign: "center" }]}>{title}</Text>
      {!!body && <Text style={[styles.body, { textAlign: "center" }]}>{body}</Text>}
      {action}
    </View>
  );
}
