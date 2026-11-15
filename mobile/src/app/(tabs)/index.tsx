import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OrderStatus } from "@shared/api";
import { CategoryBubbles } from "@/components/CategoryBubbles";
import { ACTIVE_STATUSES, Greeting } from "@/components/Greeting";
import { ProductCard } from "@/components/ProductCard";
import { useAuth } from "@/lib/auth";
import { formatSlotDate, statusLabel, statusSteps } from "@/lib/orders";
import { useCategories, useOrders, useProducts, useZones } from "@/lib/queries";
import { sellableQuantity } from "@/lib/stock";
import { colors, radius, shadow, spacing } from "@/lib/theme";

function Hero() {
  const router = useRouter();
  const zones = useZones();
  const areas = (zones.data ?? []).map((z) => z.name);
  return (
    <View style={s.hero}>
      <View style={s.heroBlob} />
      <Text style={s.heroKicker}>FRESHMART KAMPALA</Text>
      <Text style={s.heroTitle}>Fresh groceries,{"\n"}delivered to your door</Text>
      <Text style={s.heroBody}>
        {areas.length ? `Now delivering in ${areas.join(", ")}.` : "Pick a delivery time and pay cash on arrival."}
      </Text>
      <Pressable onPress={() => router.navigate("/shop")} style={s.heroButton} accessibilityRole="button">
        <Text style={s.heroButtonText}>Start shopping</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.primary} />
      </Pressable>
      <Ionicons name="basket" size={110} color="rgba(255,255,255,0.14)" style={s.heroIcon} />
    </View>
  );
}

function ActiveOrder() {
  const router = useRouter();
  const { status } = useAuth();
  const orders = useOrders();
  if (status !== "signedIn") return null;
  const o = orders.data?.find((x) => ACTIVE_STATUSES.includes(x.status ?? ""));
  if (!o) return null;
  const st = (o.status ?? "pending") as OrderStatus;
  const step = statusSteps.indexOf(st);
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/orders/[id]", params: { id: String(o.id) } })}
      style={({ pressed }) => [s.card, shadow, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Track order ${o.id}, ${statusLabel[st]}`}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={s.iconCircle}><Ionicons name="bicycle" size={22} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Order #{o.id} · {statusLabel[st]}</Text>
          <Text style={s.muted}>{o.slotDate ? `${formatSlotDate(o.slotDate)}, ${o.slotLabel ?? ""}` : ""}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
      <View style={s.progress}>
        {statusSteps.slice(0, 4).map((_, i) => (
          <View key={i} style={[s.progressSeg, i <= step && { backgroundColor: colors.primary }]} />
        ))}
      </View>
      {o.transportStatus === "to_agree" && (
        <Text style={[s.muted, { color: colors.warning }]}>We'll call you to agree the transport fee.</Text>
      )}
    </Pressable>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.section}>{title}</Text>
      {!!action && (
        <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
          <Text style={s.link}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const how: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> = [
  { icon: "time-outline", text: "Pick a delivery slot" },
  { icon: "call-outline", text: "We call to agree transport" },
  { icon: "cash-outline", text: "Pay cash on delivery" },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const categories = useCategories();
  const products = useProducts({});
  const orders = useOrders();
  const picks = (products.data ?? []).filter((p) => sellableQuantity(p) > 0).slice(0, 10);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.lg * 2, gap: spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={products.isRefetching}
          onRefresh={() => void Promise.all([products.refetch(), categories.refetch(), orders.refetch()])}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
        <Greeting />
        <Hero />
        <ActiveOrder />
      </View>

      <View style={{ gap: spacing.sm }}>
        <View style={{ paddingHorizontal: spacing.md }}>
          <SectionHeader title="Shop by category" action="View all" onPress={() => router.navigate({ pathname: "/shop", params: { category: "" } })} />
        </View>
        <CategoryBubbles
          categories={categories.data ?? []}
          selected={-1}
          onSelect={(id) => router.navigate({ pathname: "/shop", params: { category: id ? String(id) : "" } })}
        />
      </View>

      {picks.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.md }}>
            <SectionHeader title="Fresh picks" action="See all" onPress={() => router.navigate("/shop")} />
          </View>
          <FlatList
            horizontal
            data={picks}
            keyExtractor={(p) => String(p.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.md }}
            renderItem={({ item }) => <ProductCard product={item} width={168} />}
          />
        </View>
      )}

      <View style={{ paddingHorizontal: spacing.md }}>
        <Pressable onPress={() => router.push("/help")} style={[s.card, shadow, { gap: spacing.md }]} accessibilityRole="button">
          <SectionHeader title="How FreshMart works" action="Learn more" onPress={() => router.push("/help")} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {how.map((h) => (
              <View key={h.text} style={s.howItem}>
                <View style={s.iconCircle}><Ionicons name={h.icon} size={20} color={colors.primary} /></View>
                <Text style={s.howText}>{h.text}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, overflow: "hidden",
  },
  heroBlob: {
    position: "absolute", right: -60, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: colors.primaryDark,
  },
  heroIcon: { position: "absolute", right: 8, bottom: -14 },
  heroKicker: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  heroTitle: { color: colors.onPrimary, fontSize: 24, fontWeight: "800", lineHeight: 30, letterSpacing: -0.3 },
  heroBody: { color: "rgba(255,255,255,0.88)", fontSize: 14, lineHeight: 20, maxWidth: "80%" },
  heroButton: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.sm,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill,
  },
  heroButtonText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  progress: { flexDirection: "row", gap: 6 },
  progressSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  section: { fontSize: 17, fontWeight: "700", color: colors.text },
  link: { color: colors.primary, fontWeight: "600" },
  howItem: { flex: 1, alignItems: "center", gap: 6 },
  howText: { fontSize: 12, color: colors.text, textAlign: "center", fontWeight: "500" },
});
