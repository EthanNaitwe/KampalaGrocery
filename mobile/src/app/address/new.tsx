import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ErrorState, Loading } from "@/components/States";
import { Button, Field, styles } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { toE164Uganda } from "@/lib/phone";
import { useCreateAddress, useZones } from "@/lib/queries";
import { colors, formatUGX, spacing } from "@/lib/theme";

export default function NewAddressScreen() {
  const router = useRouter();
  const zones = useZones();
  const create = useCreateAddress();
  const [zoneId, setZoneId] = useState<number>();
  const [label, setLabel] = useState("");
  const [line, setLine] = useState("");
  const [instructions, setInstructions] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (zones.isLoading) return <Loading label="Loading delivery areas" />;
  if (zones.error) return <ErrorState error={zones.error} onRetry={() => void zones.refetch()} />;

  const save = () => {
    const e: Record<string, string> = {};
    if (!zoneId) e.zone = "Choose your area";
    if (line.trim().length < 3) e.line = "Enter the street, building or a landmark";
    const contactPhone = phone.trim() ? toE164Uganda(phone) : undefined;
    if (phone.trim() && !contactPhone) e.phone = "Enter a valid Ugandan mobile number";
    setErrors(e);
    if (Object.keys(e).length) return;

    create.mutate(
      {
        zoneId: zoneId!,
        line: line.trim(),
        ...(label.trim() && { label: label.trim() }),
        ...(instructions.trim() && { instructions: instructions.trim() }),
        ...(contactPhone && { contactPhone }),
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.label}>Area</Text>
        <Text style={[styles.body, { fontSize: 13 }]}>We currently deliver to these areas.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(zones.data ?? []).map((z) => {
            const active = z.id === zoneId;
            return (
              <Pressable
                key={z.id}
                onPress={() => setZoneId(z.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${z.name}, delivery ${formatUGX(z.fee)}`}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? "#f0fdf4" : colors.surface,
                }}
              >
                <Text style={{ fontWeight: "600", color: colors.text }}>{z.name}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Delivery {formatUGX(z.fee)}</Text>
              </Pressable>
            );
          })}
        </View>
        {!!errors.zone && <Text style={styles.error}>{errors.zone}</Text>}
      </View>

      <Field label="Street, building or landmark" value={line} onChangeText={setLine} placeholder="Plot 12, Acacia Avenue" autoComplete="street-address" error={errors.line} maxLength={300} />
      <Field label="Label (optional)" value={label} onChangeText={setLabel} placeholder="Home, Work…" maxLength={50} />
      <Field label="Directions for the rider (optional)" value={instructions} onChangeText={setInstructions} placeholder="Blue gate opposite the church" multiline maxLength={500} />
      <Field label="Contact phone (optional)" value={phone} onChangeText={setPhone} placeholder="Defaults to your account number" keyboardType="phone-pad" error={errors.phone} />

      {!!create.error && <Text style={styles.error}>{errorMessage(create.error)}</Text>}
      <Button title="Save address" onPress={save} loading={create.isPending} />
    </ScrollView>
  );
}
