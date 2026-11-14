import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/lib/theme";

export const MAX_QTY = 99; // matches the server contract

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label: string;
}) {
  const btn = (icon: "remove" | "add", next: number, disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={[s.btn, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
    </Pressable>
  );
  return (
    <View style={s.row} accessibilityLabel={`${label} quantity ${value}`}>
      {btn("remove", value - 1, value <= min, `Decrease ${label}`)}
      <Text style={s.value}>{value}</Text>
      {btn("add", value + 1, value >= MAX_QTY, `Increase ${label}`)}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  value: { minWidth: 24, textAlign: "center", fontSize: 16, fontWeight: "600", color: colors.text },
});
