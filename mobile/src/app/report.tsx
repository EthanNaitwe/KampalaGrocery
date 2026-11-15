import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { issueCategories, issueCategoryLabels } from "@shared/api";
import { SupportContacts } from "@/components/SupportContacts";
import { Button, Field, styles } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { formatSlotDate } from "@/lib/orders";
import { useOrders, useReportIssue } from "@/lib/queries";
import { colors, spacing } from "@/lib/theme";

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1,
        borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface,
      }}
    >
      <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Report a problem. Opened from an order (?orderId=) it's about that order; opened from
 * My issues the customer picks a recent order or "Not about an order".
 */
export default function ReportScreen() {
  const params = useLocalSearchParams<{ orderId?: string }>();
  const fixedOrder = params.orderId ? Number(params.orderId) : null;
  const router = useRouter();
  const report = useReportIssue();
  const orders = useOrders();
  const recent = (orders.data ?? []).slice(0, 5);
  const [orderId, setOrderId] = useState<number | null>(fixedOrder);
  const [category, setCategory] = useState<string>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!category) return setError("Choose what went wrong");
    if (message.trim().length < 5) return setError("Tell us a little more");
    setError(null);
    report.mutate(
      { category, message: message.trim(), orderId },
      { onSuccess: () => router.back(), onError: (e) => setError(errorMessage(e)) },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">
        {fixedOrder ? `Problem with order #${fixedOrder}` : "Report a problem"}
      </Text>
      <Text style={styles.body}>Our team will look at this and reply under My issues.</Text>

      {!fixedOrder && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>Is it about an order?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }} accessibilityRole="radiogroup">
            <Chip label="Not about an order" active={orderId === null} onPress={() => setOrderId(null)} />
            {recent.map((o) => (
              <Chip
                key={o.id}
                label={`#${o.id}${o.slotDate ? ` · ${formatSlotDate(o.slotDate)}` : ""}`}
                active={orderId === o.id}
                onPress={() => setOrderId(o.id)}
              />
            ))}
          </View>
        </View>
      )}

      <Text style={styles.label}>What went wrong?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }} accessibilityRole="radiogroup">
        {issueCategories.map((c) => (
          <Chip key={c} label={issueCategoryLabels[c]} active={c === category} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Field
        label="Tell us more"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={2000}
        placeholder={orderId ? "e.g. The tomatoes were missing from my bag" : "e.g. I can't change my delivery address"}
        error={error}
      />
      <Button title="Send" onPress={submit} loading={report.isPending} />
      <View style={{ marginTop: spacing.md }}>
        <SupportContacts />
      </View>
    </ScrollView>
  );
}
