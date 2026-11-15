import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, MessageSquareWarning, LifeBuoy, PackageX } from "lucide-react";
import type { AdminSummary } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ugx } from "./api";
import { PageHeader } from "./Layout";
import { statusMeta } from "./status";

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "summary"],
    queryFn: () => api<AdminSummary>("/admin/summary"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) return <p className="text-destructive">{(error as Error)?.message ?? "Failed to load"}</p>;

  const alerts = [
    data.transportToAgree > 0 && {
      icon: AlertTriangle, href: "/orders", tone: "text-amber-700",
      text: `${data.transportToAgree} order${data.transportToAgree > 1 ? "s" : ""} waiting for a transport fee to be agreed with the customer.`,
    },
    data.failedNotifications > 0 && {
      icon: MessageSquareWarning, href: "/orders?status=all", tone: "text-destructive",
      text: `${data.failedNotifications} customer text${data.failedNotifications > 1 ? "s" : ""} failed in the last 7 days. Open the order to resend.`,
    },
    data.openIssues > 0 && {
      icon: LifeBuoy, href: "/issues", tone: "text-amber-700",
      text: `${data.openIssues} open support issue${data.openIssues > 1 ? "s" : ""}.`,
    },
    data.lowStock.some((p) => p.stockQuantity === 0) && {
      icon: PackageX, href: "/products", tone: "text-destructive",
      text: `${data.lowStock.filter((p) => p.stockQuantity === 0).length} product(s) out of stock.`,
    },
  ].filter(Boolean) as Array<{ icon: typeof AlertTriangle; href: string; tone: string; text: string }>;

  return (
    <div className="space-y-6">
      <PageHeader title="Today" description="Refreshes every 30 seconds." />

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Link key={a.text} href={a.href} className={`flex items-center gap-2 rounded-md border bg-background p-3 text-sm ${a.tone} hover:bg-muted`}>
              <a.icon className="h-4 w-4 shrink-0" /> {a.text}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {(Object.keys(data.awaiting) as Array<keyof AdminSummary["awaiting"]>).map((s) => (
          <Link key={s} href={`/orders?status=${s}`}>
            <Card className="hover:border-primary cursor-pointer">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">{statusMeta[s].label}</div>
                <div className="text-3xl font-bold">{data.awaiting[s]}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Delivered today</div>
            <div className="text-3xl font-bold">{data.deliveredToday.count}</div>
            <div className="text-xs text-muted-foreground">{ugx(data.deliveredToday.total)} cash to collect</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Today's delivery slots</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.todaySlots.length === 0 && <p className="text-sm text-muted-foreground">No active slots.</p>}
            {data.todaySlots.map((s) => (
              <div key={s.slotId}>
                <div className="flex justify-between text-sm">
                  <span>{s.label}</span>
                  <span className="text-muted-foreground">
                    {s.booked}/{s.capacity} booked{s.reason === "closed" ? " · closed" : ""}
                  </span>
                </div>
                <Progress value={s.capacity ? (s.booked / s.capacity) * 100 : 0} className="mt-1 h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Low stock</CardTitle></CardHeader>
          <CardContent>
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing running low.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.lowStock.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span>{p.name}</span>
                    <span className={p.stockQuantity === 0 ? "text-destructive font-semibold" : "text-amber-700"}>
                      {p.stockQuantity === 0 ? "Out of stock" : `${p.stockQuantity} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/products" className="text-sm text-primary mt-3 inline-block">Manage stock →</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
