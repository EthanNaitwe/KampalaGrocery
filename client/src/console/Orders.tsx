import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { MapPin, RefreshCw, Send, Search } from "lucide-react";
import { orderTransitions, type AdminOrderDetail, type AdminOrdersResponse, type OrderStatus } from "@shared/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api, fmtDateTime, fmtSlotDate, kampalaToday, ugx } from "./api";
import { PageHeader } from "./Layout";
import { statusLabel, statusMeta } from "./status";

const tabs: Array<{ value: string; label: string }> = [
  { value: "active", label: "All active" },
  { value: "pending", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "preparing", label: "Packing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

function StatusBadge({ status }: { status: string | null }) {
  const meta = statusMeta[(status ?? "pending") as OrderStatus];
  return <Badge variant="outline" className={`${meta?.badge ?? ""} border-transparent font-medium`}>{statusLabel(status)}</Badge>;
}

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "active";
  const slotDate = params.get("date") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const limit = 50;

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p);
    setPage(0);
  };

  const qs = new URLSearchParams({ status, limit: String(limit), offset: String(page * limit) });
  if (slotDate) qs.set("slotDate", slotDate);
  if (params.get("q")) qs.set("q", params.get("q")!);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "orders", qs.toString()],
    queryFn: () => api<AdminOrdersResponse>(`/admin/orders?${qs}`),
    refetchInterval: 30_000,
  });

  const count = (s: string) => {
    if (!data) return null;
    if (s === "all") return Object.values(data.counts).reduce((a, b) => a + b, 0);
    if (s === "active") return ["pending", "confirmed", "preparing", "out_for_delivery"].reduce((a, k) => a + (data.counts[k] ?? 0), 0);
    return data.counts[s] ?? 0;
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Active orders are sorted by delivery slot, soonest first."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <Tabs value={status} onValueChange={(v) => update({ status: v })}>
        <TabsList className="flex-wrap h-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {count(t.value) !== null && <span className="ml-1 text-xs text-muted-foreground">{count(t.value)}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <form
        className="flex flex-wrap items-end gap-3 my-4"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() });
        }}
      >
        <div>
          <Label htmlFor="date" className="text-xs">Delivery date</Label>
          <div className="flex gap-1">
            <Input id="date" type="date" value={slotDate} onChange={(e) => update({ date: e.target.value })} className="w-44" />
            <Button type="button" variant="ghost" size="sm" onClick={() => update({ date: kampalaToday() })}>Today</Button>
            {slotDate && <Button type="button" variant="ghost" size="sm" onClick={() => update({ date: "" })}>Clear</Button>}
          </div>
        </div>
        <div className="flex-1 min-w-[220px]">
          <Label htmlFor="q" className="text-xs">Search</Label>
          <div className="flex gap-1">
            <Input id="q" placeholder="Order number or phone" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" variant="secondary"><Search className="h-4 w-4" /></Button>
          </div>
        </div>
      </form>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : (
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Area</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rider</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No orders match.</TableCell></TableRow>
              )}
              {data!.items.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.id)}>
                  <TableCell className="font-medium">{o.id}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {fmtSlotDate(o.slotDate)}
                    <div className="text-xs text-muted-foreground">{o.slotLabel ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    {o.customerName || "—"}
                    <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                  </TableCell>
                  <TableCell>{o.deliveryZoneName ?? "—"}</TableCell>
                  <TableCell className="text-right">{o.itemCount}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {ugx(o.total)}
                    {o.transportStatus === "to_agree" && <div className="text-xs text-destructive">+ transport to agree</div>}
                  </TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-sm">{o.assignedRider ?? <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.total > limit && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <span className="text-muted-foreground">
            {page * limit + 1}–{Math.min((page + 1) * limit, data.total)} of {data.total}
          </span>
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={(page + 1) * limit >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      <OrderSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function OrderSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [rider, setRider] = useState<string | null>(null);

  const { data: o, isLoading } = useQuery({
    queryKey: ["admin", "order", id],
    queryFn: () => api<AdminOrderDetail>(`/admin/orders/${id}`),
    enabled: id !== null,
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ["admin"] });
  };
  const onError = (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" });

  const move = useMutation({
    mutationFn: (status: OrderStatus) => api(`/orders/${id}/status`, { method: "PUT", body: { status, ...(note.trim() && { note: note.trim() }) } }),
    onSuccess: (_d, status) => {
      setNote("");
      refresh();
      toast({ title: `Order #${id}: ${statusLabel(status)}` });
    },
    onError,
  });
  const assign = useMutation({
    mutationFn: (assignedRider: string | null) => api(`/admin/orders/${id}`, { method: "PATCH", body: { assignedRider } }),
    onSuccess: () => {
      setRider(null);
      refresh();
    },
    onError,
  });
  const [fee, setFee] = useState<string | null>(null);
  const transport = useMutation({
    mutationFn: (amount: string) => api(`/admin/orders/${id}/transport`, { method: "POST", body: { fee: amount } }),
    onSuccess: () => {
      setFee(null);
      refresh();
      toast({ title: "Transport agreed", description: "The customer has been sent the new total." });
    },
    onError,
  });
  const resend = useMutation({
    mutationFn: (nid: number) => api<{ status: string; error: string | null }>(`/admin/notifications/${nid}/resend`, { method: "POST" }),
    onSuccess: (n) => {
      refresh();
      toast({ title: n.status === "sent" ? "Text sent" : `Not sent: ${n.error ?? n.status}`, variant: n.status === "sent" ? "default" : "destructive" });
    },
    onError,
  });

  const status = (o?.status ?? "pending") as OrderStatus;
  const next = orderTransitions[status] ?? [];

  return (
    <Sheet open={id !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Order #{id}</SheetTitle>
        </SheetHeader>
        {isLoading || !o ? (
          <Skeleton className="h-64 w-full mt-4" />
        ) : (
          <div className="space-y-6 mt-4 text-sm">
            <section className="flex items-center justify-between">
              <StatusBadge status={o.status} />
              <span className="text-muted-foreground">Placed {fmtDateTime(o.createdAt)}</span>
            </section>

            {next.length > 0 && (
              <section className="space-y-2 rounded-md border p-3">
                <div className="font-semibold">Next step</div>
                <Textarea placeholder="Note for the audit trail (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                <div className="flex flex-wrap gap-2">
                  {next.map((s) => (
                    <Button
                      key={s}
                      variant={s === "cancelled" ? "destructive" : "default"}
                      disabled={move.isPending || (s === "out_for_delivery" && o.transportStatus === "to_agree")}
                      title={s === "out_for_delivery" && o.transportStatus === "to_agree" ? "Agree transport first" : undefined}
                      onClick={() => {
                        if (s === "cancelled" && !confirm(`Cancel order #${id}? Stock is returned and the customer is texted.`)) return;
                        move.mutate(s);
                      }}
                    >
                      {statusMeta[s].action}
                    </Button>
                  ))}
                </div>
                {status !== "pending" && status !== "confirmed" && next.includes("cancelled") && (
                  <p className="text-xs text-muted-foreground">Customers can no longer cancel in the app at this stage.</p>
                )}
              </section>
            )}

            <section className="space-y-1">
              <div className="font-semibold">Customer & delivery</div>
              <div>
                {o.customerName || "—"} · <a className="text-primary" href={`tel:${o.customerPhone}`}>{o.customerPhone}</a>
                {o.customerEmail && <> · <a className="text-primary" href={`mailto:${o.customerEmail}`}>{o.customerEmail}</a></>}
              </div>
              <div>{fmtSlotDate(o.slotDate)} · {o.slotLabel}</div>
              <div>{o.deliveryAddress} · {o.deliveryZoneName}</div>
              {o.deliveryInstructions && <div className="text-muted-foreground">Directions: {o.deliveryInstructions}</div>}
              {o.notes && <div className="text-muted-foreground">Customer note: {o.notes}</div>}
              {o.deliveryLatitude != null && o.deliveryLongitude != null && (
                <a
                  className="inline-flex items-center gap-1 text-primary font-medium"
                  href={`https://www.google.com/maps/search/?api=1&query=${o.deliveryLatitude},${o.deliveryLongitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin className="h-4 w-4" /> Open customer's pin in Google Maps
                </a>
              )}
            </section>

            <section className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Transport</div>
                {o.transportStatus === "to_agree" ? (
                  <Badge variant="destructive">To agree</Badge>
                ) : (
                  <Badge variant="secondary">Agreed {ugx(o.deliveryFee)}</Badge>
                )}
              </div>
              {["pending", "confirmed", "preparing"].includes(status) ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Call or WhatsApp the customer to agree the transport fee, then record it. They're texted the new total.
                    {o.zoneGuideFee && ` Guide for ${o.deliveryZoneName}: ${ugx(o.zoneGuideFee)}.`}
                  </p>
                  {o.customerPhone && (
                    <div className="flex gap-3 text-sm">
                      <a className="text-primary" href={`tel:${o.customerPhone}`}>Call customer</a>
                      <a className="text-primary" href={`https://wa.me/${o.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      placeholder="Agreed fee (UGX)"
                      value={fee ?? (o.deliveryFee ? String(Math.round(Number(o.deliveryFee))) : o.zoneGuideFee ? String(Math.round(Number(o.zoneGuideFee))) : "")}
                      onChange={(e) => setFee(e.target.value)}
                      className="w-44"
                    />
                    <Button
                      variant="secondary"
                      disabled={transport.isPending}
                      onClick={() => {
                        const v = (fee ?? String(Math.round(Number(o.deliveryFee ?? o.zoneGuideFee ?? 0)))).trim();
                        if (!/^\d+$/.test(v)) return toast({ title: "Enter the fee in UGX", variant: "destructive" });
                        transport.mutate(v);
                      }}
                    >
                      {o.transportStatus === "agreed" ? "Update fee" : "Save agreed fee"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Locked once the order is dispatched.</p>
              )}
            </section>

            <section className="space-y-2">
              <div className="font-semibold">Rider</div>
              <div className="flex gap-2">
                <Input
                  placeholder="Name and phone, e.g. Musa 0772 000000"
                  value={rider ?? o.assignedRider ?? ""}
                  onChange={(e) => setRider(e.target.value)}
                  maxLength={100}
                />
                <Button variant="secondary" disabled={assign.isPending || rider === null} onClick={() => assign.mutate(rider?.trim() || null)}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Included in the customer's "on the way" text.</p>
            </section>

            <section>
              <div className="font-semibold mb-1">Items to pack</div>
              <ul className="divide-y rounded-md border">
                {o.orderItems.map((it, i) => (
                  <li key={i} className="flex justify-between p-2">
                    <span><span className="font-semibold">{it.quantity} ×</span> {it.product.name}</span>
                    <span>{ugx(Number(it.price) * it.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 space-y-0.5 text-right">
                <div>Items {ugx(o.subtotal)}</div>
                <div>Transport {o.transportStatus === "to_agree" ? "to agree" : ugx(o.deliveryFee)}</div>
                <div className="font-bold">Total {ugx(o.total)} · cash on delivery ({o.paymentStatus ?? "unpaid"})</div>
              </div>
            </section>

            <section>
              <div className="font-semibold mb-1">Timeline</div>
              <ol className="space-y-1">
                {o.events?.map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {e.fromStatus === e.toStatus ? "Update" : statusLabel(e.toStatus)}
                      {e.note && <span className="text-muted-foreground"> — {e.note}</span>}
                      {e.actorName && <span className="text-muted-foreground"> · {e.actorName}</span>}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">{fmtDateTime(e.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <div className="font-semibold mb-1">Customer texts</div>
              {o.notifications.length === 0 ? (
                <p className="text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-2">
                  {o.notifications.map((n) => (
                    <li key={n.id} className="rounded-md border p-2">
                      <div className="flex justify-between items-center">
                        <Badge variant={n.status === "sent" ? "secondary" : "destructive"}>{n.status}</Badge>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)} · {n.attempts} attempt(s)</span>
                      </div>
                      <p className="mt-1">{n.body}</p>
                      {n.error && <p className="text-xs text-destructive mt-1">{n.error}</p>}
                      {n.status !== "sent" && (
                        <Button size="sm" variant="outline" className="mt-2" disabled={resend.isPending} onClick={() => resend.mutate(n.id)}>
                          <Send className="h-3 w-3 mr-1" /> Resend
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {o.issues.length > 0 && (
              <section>
                <div className="font-semibold mb-1">Support issues</div>
                <ul className="space-y-2">
                  {o.issues.map((i) => (
                    <li key={i.id} className="rounded-md border p-2">
                      <Badge variant={i.status === "open" ? "destructive" : "secondary"}>{i.status}</Badge>{" "}
                      <span className="font-medium">{i.category.replace("_", " ")}</span>
                      <p className="mt-1">{i.message}</p>
                      {i.resolution && <p className="text-xs text-muted-foreground mt-1">Resolution: {i.resolution}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
