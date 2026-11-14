import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { OrderResponse } from "@shared/api";
import { ErrorState, Loading } from "@/components/States";
import { Button, Field, styles } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatSlotDate } from "@/lib/orders";
import { keys, useAddresses, useQuote, useSlots } from "@/lib/queries";
import { authedApi } from "@/lib/session";
import { colors, formatUGX, spacing } from "@/lib/theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

function Option({ selected, onPress, disabled, children, label }: {
  selected: boolean; onPress: () => void; disabled?: boolean; children: React.ReactNode; label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={[s.option, selected && s.optionSelected, disabled && { opacity: 0.45 }]}
    >
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.primary : colors.muted} />
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export default function CheckoutScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const addresses = useAddresses();
  const slots = useSlots();
  const [addressId, setAddressId] = useState<number>();
  const [slotKey, setSlotKey] = useState<string>();
  const [date, setDate] = useState<string>();
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quote = useQuote(addressId);

  // One key per checkout visit: a retry after a timeout or double tap returns the same order.
  const idempotencyKey = useRef(Crypto.randomUUID());

  // Default to the most recently added address.
  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId(addresses.data[addresses.data.length - 1].id);
  }, [addresses.data, addressId]);

  const dates = useMemo(() => [...new Set((slots.data ?? []).map((x) => x.date))], [slots.data]);
  useEffect(() => {
    if (!date && dates.length) {
      // Pick the first date that still has an open slot.
      setDate(dates.find((d) => slots.data?.some((x) => x.date === d && x.available)) ?? dates[0]);
    }
  }, [dates, date, slots.data]);

  const selectedSlot = slots.data?.find((x) => `${x.slotId}:${x.date}` === slotKey);
  const issues = quote.data?.issues ?? [];
  const canPlace = !!addressId && !!selectedSlot?.available && !!quote.data && issues.length === 0 && !placing;

  const place = async () => {
    if (!canPlace || !selectedSlot || !addressId) return;
    setPlacing(true);
    setError(null);
    try {
      const order = await authedApi<OrderResponse>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: {
          addressId,
          slotId: selectedSlot.slotId,
          slotDate: selectedSlot.date,
          paymentMethod: "cod",
          ...(notes.trim() && { notes: notes.trim() }),
        },
        timeoutMs: 30_000,
      });
      client.setQueryData(keys.cart, []);
      client.invalidateQueries({ queryKey: keys.cart });
      client.invalidateQueries({ queryKey: keys.orders });
      client.invalidateQueries({ queryKey: keys.slots });
      router.dismissTo("/");
      router.push({ pathname: "/orders/[id]", params: { id: String(order.id), placed: "1" } });
    } catch (e) {
      setError(
        e instanceof ApiError && (e.kind === "timeout" || e.kind === "offline")
          ? "We couldn't confirm your order. Tap Place order again — you won't be charged or get a duplicate order."
          : errorMessage(e),
      );
      // Slot filled up or closed, or cart changed: refresh what's shown.
      if (e instanceof ApiError && e.status === 409) {
        slots.refetch();
        quote.refetch();
      }
    } finally {
      setPlacing(false);
    }
  };

  if (addresses.isLoading || slots.isLoading) return <Loading label="Loading checkout" />;
  if (addresses.error) return <ErrorState error={addresses.error} onRetry={() => void addresses.refetch()} />;
  if (slots.error) return <ErrorState error={slots.error} onRetry={() => void slots.refetch()} />;

  const today = dates[0];
  const tomorrow = dates[1];

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 }} keyboardShouldPersistTaps="handled">
      <Section title="Deliver to">
        {(addresses.data ?? []).map((a) => (
          <Option key={a.id} selected={a.id === addressId} onPress={() => setAddressId(a.id)} label={`${a.label ?? "Address"}, ${a.line}, ${a.zoneName}`}>
            <Text style={s.optTitle}>{a.label || a.zoneName}</Text>
            <Text style={styles.body}>{a.line} · {a.zoneName}</Text>
            {!!a.instructions && <Text style={[styles.body, { fontSize: 13 }]}>{a.instructions}</Text>}
          </Option>
        ))}
        <Button title={addresses.data?.length ? "Add another address" : "Add delivery address"} variant="secondary" onPress={() => router.push("/address/new")} />
      </Section>

      <Section title="Delivery time">
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          {dates.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDate(d)}
              style={[s.chip, d === date && s.chipActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: d === date }}
            >
              <Text style={[s.chipText, d === date && { color: "#fff" }]}>{formatSlotDate(d, today, tomorrow)}</Text>
            </Pressable>
          ))}
        </View>
        {(slots.data ?? [])
          .filter((x) => x.date === date)
          .map((x) => {
            const key = `${x.slotId}:${x.date}`;
            const sub = !x.available ? (x.reason === "full" ? "Fully booked" : "Closed for orders") : x.remaining <= 5 ? `Only ${x.remaining} left` : "Available";
            return (
              <Option key={key} selected={key === slotKey} disabled={!x.available} onPress={() => setSlotKey(key)} label={`${x.label}, ${sub}`}>
                <Text style={s.optTitle}>{x.label}</Text>
                <Text style={[styles.body, !x.available && { color: colors.muted }]}>{sub}</Text>
              </Option>
            );
          })}
        {date && !slots.data?.some((x) => x.date === date && x.available) && (
          <Text style={styles.body}>No slots left on this day. Try another date.</Text>
        )}
      </Section>

      <Section title="Payment">
        <Option selected onPress={() => {}} label="Cash on delivery">
          <Text style={s.optTitle}>Cash on delivery</Text>
          <Text style={styles.body}>Pay the rider when your groceries arrive.</Text>
        </Option>
      </Section>

      <Field label="Notes for the rider (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. call on arrival" maxLength={1000} multiline />

      <Section title="Summary">
        {!addressId ? (
          <Text style={styles.body}>Add an address to see the delivery fee.</Text>
        ) : quote.isLoading ? (
          <Loading label="Calculating total" />
        ) : quote.error ? (
          <Text style={styles.error}>{errorMessage(quote.error)}</Text>
        ) : quote.data ? (
          <View style={{ gap: spacing.xs }}>
            <Row label={`Items (${quote.data.itemCount})`} value={formatUGX(quote.data.subtotal)} />
            <Row label="Delivery" value={formatUGX(quote.data.deliveryFee)} />
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }} />
            <Row label="Total" value={formatUGX(quote.data.total)} bold />
            {issues.map((i) => (
              <Text key={i.code} style={styles.error}>{i.message}</Text>
            ))}
          </View>
        ) : null}
      </Section>

      {!!error && <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text>}
      <Button
        title={quote.data ? `Place order · ${formatUGX(quote.data.total)}` : "Place order"}
        onPress={place}
        loading={placing}
        disabled={!canPlace}
      />
      {!selectedSlot && <Text style={[styles.body, { textAlign: "center", fontSize: 13 }]}>Choose a delivery time to continue.</Text>}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[styles.body, bold && { color: colors.text, fontWeight: "700", fontSize: 17 }]}>{label}</Text>
      <Text style={[{ color: colors.text, fontSize: 15 }, bold && { fontWeight: "700", fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  option: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", padding: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  optionSelected: { borderColor: colors.primary, backgroundColor: "#f0fdf4" },
  optTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "500" },
});
