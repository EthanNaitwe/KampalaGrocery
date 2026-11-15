import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { customerCancellable, issueCategoryLabels, type OrderStatus } from "@shared/api";
import { ErrorState, Loading } from "@/components/States";
import { Button, styles } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatSlotDate, statusLabel, statusSteps } from "@/lib/orders";
import { useCancelOrder, useOrder, useOrderIssues } from "@/lib/queries";
import { SupportContacts } from "@/components/SupportContacts";
import { colors, formatUGX, radius, shadow, spacing } from "@/lib/theme";

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const orderId = Number(id);
  const order = useOrder(orderId);
  const cancel = useCancelOrder(orderId);
  const issues = useOrderIssues(orderId);
  const router = useRouter();

  if (order.isLoading) return <Loading label="Loading order" />;
  if (!order.data) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;

  const o = order.data;
  const status = (o.status ?? "pending") as OrderStatus;
  const cancelled = status === "cancelled";
  const reached = new Map((o.events ?? []).map((e) => [e.toStatus, e.createdAt]));
  const currentStep = statusSteps.indexOf(status);

  const confirmCancel = () =>
    Alert.alert("Cancel this order?", "You won't be charged.", [
      { text: "Keep order", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: () => cancel.mutate(undefined, { onError: (e) => Alert.alert("Couldn't cancel", errorMessage(e)) }),
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: `Order #${o.id}` }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 }}
        refreshControl={<RefreshControl refreshing={order.isRefetching} onRefresh={() => void order.refetch()} tintColor={colors.primary} />}
      >
        {placed === "1" && !cancelled && (
          <View style={[s.card, { backgroundColor: colors.primarySoft, borderColor: colors.primary, alignItems: "center" }]} accessibilityLiveRegion="polite">
            <Ionicons name="checkmark-circle" size={40} color={colors.primary} />
            <Text style={[styles.title, { fontSize: 20 }]}>Order placed</Text>
            <Text style={[styles.body, { textAlign: "center" }]}>We'll text you as it progresses. Pay cash when it arrives.</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.h}>Status</Text>
          {cancelled ? (
            <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 16 }}>Cancelled {formatDateTime(o.cancelledAt)}</Text>
          ) : (
            statusSteps.map((step, i) => {
              const done = i <= currentStep;
              return (
                <View key={step} style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }} accessibilityLabel={`${statusLabel[step]}${done ? ", done" : ""}`}>
                  <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={22} color={done ? colors.primary : colors.border} />
                  <Text style={{ flex: 1, color: done ? colors.text : colors.muted, fontWeight: i === currentStep ? "700" : "400" }}>{statusLabel[step]}</Text>
                  {!!reached.get(step) && <Text style={[styles.body, { fontSize: 12 }]}>{formatDateTime(reached.get(step))}</Text>}
                </View>
              );
            })
          )}
        </View>

        <View style={s.card}>
          <Text style={s.h}>Delivery</Text>
          {!!o.slotDate && <Text style={styles.body}>{formatSlotDate(o.slotDate)} · {o.slotLabel}</Text>}
          <Text style={styles.body}>{o.deliveryAddress}{o.deliveryZoneName ? ` · ${o.deliveryZoneName}` : ""}</Text>
          {!!o.deliveryInstructions && <Text style={styles.body}>{o.deliveryInstructions}</Text>}
          {!!o.notes && <Text style={styles.body}>Note: {o.notes}</Text>}
        </View>

        <View style={s.card}>
          <Text style={s.h}>Items</Text>
          {o.orderItems.map((it, idx) => (
            <View key={idx} style={s.row}>
              <Text style={[styles.body, { flex: 1, color: colors.text }]}>{it.quantity} × {it.product.name}</Text>
              <Text style={{ color: colors.text }}>{formatUGX(Number(it.price) * it.quantity)}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: colors.border }} />
          {o.subtotal != null && <Line label="Items" value={formatUGX(o.subtotal)} />}
          {o.transportStatus === "to_agree" ? (
            <Line label="Transport" value="We'll call you to agree" />
          ) : (
            o.deliveryFee != null && <Line label="Transport" value={formatUGX(o.deliveryFee)} />
          )}
          <Line label={o.transportStatus === "to_agree" ? "Items total so far" : "Total"} value={formatUGX(o.total)} bold />
          {o.transportStatus === "to_agree" && !cancelled && (
            <Text style={[styles.body, { fontSize: 13 }]}>
              FreshMart will call {o.customerPhone ?? "you"} to agree the transport fee. You'll get a text with the final total.
            </Text>
          )}
          <Text style={[styles.body, { fontSize: 13 }]}>
            Cash on delivery · {o.paymentStatus === "paid" ? "Paid" : o.paymentStatus === "void" ? "Not charged" : "Pay on arrival"}
          </Text>
        </View>

        {!!issues.data?.length && (
          <View style={s.card}>
            <Text style={s.h}>Problems reported</Text>
            {issues.data.map((i) => (
              <View key={i.id} style={{ gap: 2 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {issueCategoryLabels[i.category as keyof typeof issueCategoryLabels] ?? i.category} ·{" "}
                  <Text style={{ color: i.status === "resolved" ? colors.primary : colors.warning }}>
                    {i.status === "resolved" ? "Resolved" : "We're on it"}
                  </Text>
                </Text>
                <Text style={styles.body}>{i.message}</Text>
                {!!i.resolution && <Text style={[styles.body, { color: colors.text }]}>Our reply: {i.resolution}</Text>}
              </View>
            ))}
          </View>
        )}

        {customerCancellable.includes(status) && (
          <Button title="Cancel order" variant="danger" onPress={confirmCancel} loading={cancel.isPending} />
        )}
        {!cancelled && (
          <Button
            title="Report a problem"
            variant="secondary"
            onPress={() => router.push({ pathname: "/report", params: { orderId: String(o.id) } })}
          />
        )}
        <View style={[s.card, { marginTop: spacing.sm }]}>
          <SupportContacts />
        </View>
      </ScrollView>
    </>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[styles.body, bold && { color: colors.text, fontWeight: "700" }]}>{label}</Text>
      <Text style={[{ color: colors.text }, bold && { fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  h: { fontSize: 17, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
});
