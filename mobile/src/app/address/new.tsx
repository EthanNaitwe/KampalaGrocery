import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ErrorState, Loading } from "@/components/States";
import { Button, Field, styles } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { mapsUrl, matchZone, pinCurrentLocation, type Pin } from "@/lib/location";
import { toE164Uganda } from "@/lib/phone";
import { useCreateAddress, useZones } from "@/lib/queries";
import { colors, formatUGX, radius, shadow, spacing } from "@/lib/theme";

export default function NewAddressScreen() {
  const router = useRouter();
  const zones = useZones();
  const create = useCreateAddress();
  // Email-only accounts have no number for the rider or staff to call, so the address needs one.
  const needsPhone = !useAuth().user?.phoneNumber;
  const [zoneId, setZoneId] = useState<number>();
  const [label, setLabel] = useState("");
  const [line, setLine] = useState("");
  const [instructions, setInstructions] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pin, setPin] = useState<Pin | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<{ text: string; denied: boolean } | null>(null);

  if (zones.isLoading) return <Loading label="Loading delivery areas" />;
  if (zones.error) return <ErrorState error={zones.error} onRetry={() => void zones.refetch()} />;

  const useMyLocation = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const r = await pinCurrentLocation();
      if (!r.ok) return setLocError({ text: r.message, denied: r.reason === "denied" });
      setPin(r.pin);
      if (!line.trim() && r.pin.suggestedLine) setLine(r.pin.suggestedLine);
      const z = matchZone(zones.data ?? [], r.pin.placeNames);
      if (z && !zoneId) setZoneId(z.id);
    } catch (e) {
      setLocError({ text: errorMessage(e), denied: false });
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!zoneId) e.zone = "Choose your area";
    if (line.trim().length < 3) e.line = "Enter the street, building or a landmark";
    const contactPhone = phone.trim() ? toE164Uganda(phone) : undefined;
    if (phone.trim() && !contactPhone) e.phone = "Enter a valid Ugandan mobile number";
    else if (needsPhone && !contactPhone) e.phone = "Add a phone number so we can call you about delivery";
    setErrors(e);
    if (Object.keys(e).length) return;

    create.mutate(
      {
        zoneId: zoneId!,
        line: line.trim(),
        ...(label.trim() && { label: label.trim() }),
        ...(instructions.trim() && { instructions: instructions.trim() }),
        ...(contactPhone && { contactPhone }),
        ...(pin && { latitude: pin.latitude, longitude: pin.longitude }),
      },
      { onSuccess: () => router.back() },
    );
  };

  const far = pin && pin.kmFromKampala > 40;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 }} keyboardShouldPersistTaps="handled">
      {/* Current location */}
      <View style={[s.card, shadow]}>
        <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
          <View style={s.icon}><Ionicons name={pin ? "location" : "locate-outline"} size={22} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.h}>{pin ? "Location pinned" : "Pin your location"}</Text>
            <Text style={styles.body}>
              {pin
                ? `Accurate to about ${pin.accuracy ? Math.round(pin.accuracy) : "?"} m. The rider gets this pin on a map.`
                : "Helps our rider find you and us agree transport with you."}
            </Text>
          </View>
        </View>
        {locating ? (
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", padding: spacing.sm }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>Finding you…</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button title={pin ? "Update location" : "Use my current location"} onPress={useMyLocation} variant={pin ? "secondary" : "primary"} />
            </View>
            {pin && (
              <View style={{ flex: 1 }}>
                <Button title="View on map" variant="secondary" onPress={() => void Linking.openURL(mapsUrl(pin.latitude, pin.longitude))} />
              </View>
            )}
          </View>
        )}
        {far && (
          <Text style={[styles.body, { color: colors.warning }]}>
            This pin is about {Math.round(pin.kmFromKampala)} km from Kampala. We only deliver to the areas below. Check your location is right.
          </Text>
        )}
        {!!locError && (
          <View style={{ gap: spacing.xs }}>
            <Text style={[styles.body, { color: colors.danger }]}>{locError.text}</Text>
            {locError.denied && (
              <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="link">
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Open settings</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Area */}
      <View style={[s.card, shadow]}>
        <Text style={s.h}>Area</Text>
        <Text style={[styles.body, { fontSize: 13 }]}>
          We deliver to these areas. Transport is agreed with you by phone after you order.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(zones.data ?? []).map((z) => {
            const active = z.id === zoneId;
            return (
              <Pressable
                key={z.id}
                onPress={() => setZoneId(z.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={z.name}
                style={[s.zone, active && s.zoneActive]}
              >
                <Text style={[s.zoneName, active && { color: colors.primary }]}>{z.name}</Text>
                {Number(z.minOrder) > 0 && <Text style={s.zoneSub}>Min {formatUGX(z.minOrder)}</Text>}
              </Pressable>
            );
          })}
        </View>
        {!!errors.zone && <Text style={styles.error}>{errors.zone}</Text>}
      </View>

      {/* Details */}
      <View style={[s.card, shadow]}>
        <Field label="Street, building or landmark" value={line} onChangeText={setLine} placeholder="Plot 12, Acacia Avenue" autoComplete="street-address" error={errors.line} maxLength={300} />
        <Field label="Label (optional)" value={label} onChangeText={setLabel} placeholder="Home, Work…" maxLength={50} />
        <Field label="Directions for the rider (optional)" value={instructions} onChangeText={setInstructions} placeholder="Blue gate opposite the church" multiline maxLength={500} />
        <Field
          label={needsPhone ? "Contact phone" : "Contact phone (optional)"}
          value={phone}
          onChangeText={setPhone}
          placeholder={needsPhone ? "0772 123456" : "Defaults to your account number"}
          keyboardType="phone-pad"
          error={errors.phone}
        />
      </View>

      {!!create.error && <Text style={styles.error}>{errorMessage(create.error)}</Text>}
      <Button title="Save address" onPress={save} loading={create.isPending} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  h: { fontSize: 17, fontWeight: "700", color: colors.text },
  zone: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.surface,
  },
  zoneActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  zoneName: { fontWeight: "600", color: colors.text },
  zoneSub: { fontSize: 11, color: colors.muted },
});
