import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { issueCategories, issueCategoryLabels } from "@shared/api";
import { SupportContacts } from "@/components/SupportContacts";
import { Button, Field, styles } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { useReportIssue } from "@/lib/queries";
import { colors, spacing } from "@/lib/theme";

export default function ReportScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = Number(orderId);
  const router = useRouter();
  const report = useReportIssue(id);
  const [category, setCategory] = useState<string>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!category) return setError("Choose what went wrong");
    if (message.trim().length < 5) return setError("Tell us a little more");
    setError(null);
    report.mutate({ category, message: message.trim() }, { onSuccess: () => router.back(), onError: (e) => setError(errorMessage(e)) });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">Problem with order #{id}</Text>
      <Text style={styles.body}>Our team will look at this and get back to you.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {issueCategories.map((c) => {
          const active = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1,
                borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface,
              }}
            >
              <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "500" }}>{issueCategoryLabels[c]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="What happened?" value={message} onChangeText={setMessage} multiline maxLength={2000} placeholder="e.g. The tomatoes were missing from my bag" error={error} />
      <Button title="Send" onPress={submit} loading={report.isPending} />
      <View style={{ marginTop: spacing.md }}>
        <SupportContacts />
      </View>
    </ScrollView>
  );
}
