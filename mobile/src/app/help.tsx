import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { SupportContacts } from "@/components/SupportContacts";
import { useSlots, useZones } from "@/lib/queries";
import { colors, formatUGX, radius, shadow, spacing } from "@/lib/theme";

const steps: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = [
  { icon: "basket-outline", title: "Fill your cart", body: "Browse by category or search. Your cart is saved to your account." },
  { icon: "time-outline", title: "Pick a delivery slot", body: "Choose a time window today or in the next two days." },
  { icon: "call-outline", title: "We agree transport with you", body: "After you order, we call you to agree the transport fee for your location." },
  { icon: "cash-outline", title: "Pay on delivery", body: "Pay the rider in cash when your groceries arrive." },
  { icon: "chatbubble-ellipses-outline", title: "We keep you posted", body: "We text you when your order is confirmed and on its way." },
];

export default function HelpScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const zones = useZones();
  const slots = useSlots();
  const slotLabels = [...new Set((slots.data ?? []).map((x) => x.label))];

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 }}>
      <View style={s.card}>
        <Text style={s.h}>How FreshMart works</Text>
        {steps.map((st) => (
          <View key={st.title} style={s.step}>
            <View style={s.icon}><Ionicons name={st.icon} size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>{st.title}</Text>
              <Text style={s.body}>{st.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.h}>Where we deliver</Text>
        {(zones.data ?? []).map((z) => (
          <View key={z.id} style={s.row}>
            <Text style={s.rowLabel}>{z.name}</Text>
            <Text style={s.body}>{Number(z.minOrder) > 0 ? `Min order ${formatUGX(z.minOrder)}` : "No minimum"}</Text>
          </View>
        ))}
        {!!slotLabels.length && (
          <>
            <Text style={[s.stepTitle, { marginTop: spacing.sm }]}>Delivery times</Text>
            <Text style={s.body}>{slotLabels.join(" · ")}</Text>
          </>
        )}
      </View>

      <View style={s.card}>
        <SupportContacts />
        <Text style={s.body}>Something wrong? Report it and follow our reply under My issues.</Text>
        <Button
          title={status === "signedIn" ? "My issues" : "Sign in to report a problem"}
          variant="secondary"
          onPress={() => router.push(status === "signedIn" ? "/issues" : "/sign-in")}
        />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, ...shadow },
  h: { fontSize: 17, fontWeight: "700", color: colors.text },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  body: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingBottom: spacing.sm },
  rowLabel: { fontSize: 15, color: colors.text, fontWeight: "500" },
});
