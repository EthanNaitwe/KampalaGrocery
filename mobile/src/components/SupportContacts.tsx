import Ionicons from "@expo/vector-icons/Ionicons";
import { Linking, Pressable, Text, View } from "react-native";
import { styles } from "./ui";
import { useSupportInfo } from "@/lib/queries";
import { colors, spacing } from "@/lib/theme";

/** Call / WhatsApp / email links from the server's support settings. Hidden when none are set. */
export function SupportContacts() {
  const { data } = useSupportInfo();
  if (!data || (!data.phone && !data.whatsapp && !data.email)) return null;

  const wa = data.whatsapp?.replace(/[^\d]/g, "");
  const links = [
    data.phone && { icon: "call-outline" as const, label: `Call ${data.phone}`, url: `tel:${data.phone}` },
    wa && { icon: "logo-whatsapp" as const, label: "WhatsApp us", url: `https://wa.me/${wa}` },
    data.email && { icon: "mail-outline" as const, label: data.email, url: `mailto:${data.email}` },
  ].filter(Boolean) as Array<{ icon: "call-outline" | "logo-whatsapp" | "mail-outline"; label: string; url: string }>;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.label, { fontSize: 16 }]} accessibilityRole="header">Help & support</Text>
      {!!data.hours && <Text style={styles.body}>{data.hours}</Text>}
      {links.map((l) => (
        <Pressable
          key={l.url}
          onPress={() => void Linking.openURL(l.url)}
          accessibilityRole="link"
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs }}
        >
          <Ionicons name={l.icon} size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 16 }}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
