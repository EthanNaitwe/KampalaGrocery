import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CategoryResponse } from "@shared/api";
import { colors, radius, shadow, spacing } from "@/lib/theme";

/** Horizontal row of round category buttons; `undefined` = All. */
export function CategoryBubbles({
  categories,
  selected,
  onSelect,
}: {
  categories: CategoryResponse[];
  selected: number | undefined;
  onSelect: (id: number | undefined) => void;
}) {
  const items = [{ id: undefined, name: "All", icon: null as string | null }, ...categories];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={{ flexGrow: 0, flexShrink: 0 }}>
      {items.map((c) => {
        const active = c.id === selected;
        return (
          <Pressable
            key={c.id ?? "all"}
            onPress={() => onSelect(c.id)}
            style={s.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={c.name}
          >
            <View style={[s.bubble, active && s.bubbleActive]}>
              {c.icon ? (
                <Text style={s.emoji}>{c.icon}</Text>
              ) : (
                <Ionicons name="basket-outline" size={26} color={active ? colors.primary : colors.text} />
              )}
            </View>
            <Text style={[s.label, active && s.labelActive]} numberOfLines={2}>{c.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, gap: spacing.md, paddingVertical: spacing.xs },
  item: { alignItems: "center", width: 76, gap: 6 },
  bubble: {
    width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent", ...shadow,
  },
  bubbleActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  emoji: { fontSize: 26 },
  label: { fontSize: 12, color: colors.muted, fontWeight: "500", textAlign: "center", lineHeight: 15 },
  labelActive: { color: colors.primary, fontWeight: "700" },
});
