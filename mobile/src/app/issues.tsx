import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { issueCategoryLabels, type IssueResponse } from "@shared/api";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { Button } from "@/components/ui";
import { useMyIssues } from "@/lib/queries";
import { colors, radius, shadow, spacing } from "@/lib/theme";

const label = (c: string) => issueCategoryLabels[c as keyof typeof issueCategoryLabels] ?? c;
const when = (d: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

function IssueCard({ issue }: { issue: IssueResponse }) {
  const router = useRouter();
  const resolved = issue.status === "resolved";
  return (
    <View style={[s.card, shadow]}>
      <View style={s.top}>
        <Text style={s.title} numberOfLines={1}>{label(issue.category)}</Text>
        <View style={[s.pill, resolved ? s.pillDone : s.pillOpen]}>
          <Ionicons name={resolved ? "checkmark-circle" : "time"} size={14} color={resolved ? colors.primary : colors.warning} />
          <Text style={[s.pillText, { color: resolved ? colors.primary : colors.warning }]}>{resolved ? "Resolved" : "We're on it"}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
        <Text style={s.meta}>Reported {when(issue.createdAt)} · </Text>
        {issue.orderId ? (
          <Pressable
            onPress={() => router.push({ pathname: "/orders/[id]", params: { id: String(issue.orderId) } })}
            accessibilityRole="link"
            hitSlop={6}
          >
            <Text style={s.link}>Order #{issue.orderId}</Text>
          </Pressable>
        ) : (
          <Text style={s.meta}>General</Text>
        )}
      </View>
      <Text style={s.message}>{issue.message}</Text>
      {!!issue.resolution && (
        <View style={s.reply}>
          <Text style={s.replyLabel}>FreshMart replied{issue.resolvedAt ? ` · ${when(issue.resolvedAt)}` : ""}</Text>
          <Text style={s.replyText}>{issue.resolution}</Text>
        </View>
      )}
    </View>
  );
}

/** The app's Issues section: every problem this customer has reported, and our replies. */
export default function IssuesScreen() {
  const router = useRouter();
  const issues = useMyIssues();
  const report = () => router.push("/report");

  if (issues.isLoading) return <Loading label="Loading your issues" />;
  if (issues.error && !issues.data) return <ErrorState error={issues.error} onRetry={() => void issues.refetch()} />;

  const open = issues.data?.filter((i) => i.status !== "resolved").length ?? 0;

  return (
    <FlatList
      data={issues.data}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, flexGrow: 1, paddingBottom: spacing.lg * 2 }}
      refreshControl={
        <RefreshControl refreshing={issues.isRefetching} onRefresh={() => void issues.refetch()} tintColor={colors.primary} colors={[colors.primary]} />
      }
      ListHeaderComponent={
        issues.data?.length ? (
          <View style={{ gap: spacing.md }}>
            <Text style={s.summary}>
              {open ? `${open} open · we'll reply here and may call you.` : "All your issues are resolved."}
            </Text>
            <Button title="Report a problem" onPress={report} />
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        <EmptyState
          icon="chatbubbles-outline"
          title="No issues reported"
          body="If something goes wrong with an order or the app, tell us here and follow our reply."
          action={<Button title="Report a problem" onPress={report} />}
        />
      }
      renderItem={({ item }) => <IssueCard issue={item} />}
    />
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillOpen: { backgroundColor: "#FFF4E5" },
  pillDone: { backgroundColor: colors.primarySoft },
  pillText: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 13, color: colors.muted },
  link: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  message: { fontSize: 15, color: colors.text, lineHeight: 21 },
  reply: { marginTop: spacing.xs, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  replyLabel: { fontSize: 12, fontWeight: "700", color: colors.primary },
  replyText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  summary: { fontSize: 14, color: colors.muted },
});
