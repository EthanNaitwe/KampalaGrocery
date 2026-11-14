import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { AdminSlot, AdminZone } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { api, ugx } from "./api";
import { PageHeader } from "./Layout";

function useSave<T>(path: (id?: number) => string) {
  const client = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: Partial<T> }) => api<T>(path(id), { method: id ? "PATCH" : "POST", body }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["admin", "delivery"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
}

export default function Delivery() {
  return (
    <div className="space-y-6">
      <PageHeader title="Delivery settings" description="Changes apply to new orders immediately. Existing orders keep the fee and slot they were placed with." />
      <Zones />
      <Slots />
    </div>
  );
}

function Zones() {
  const zones = useQuery({ queryKey: ["admin", "delivery", "zones"], queryFn: () => api<AdminZone[]>("/admin/delivery/zones") });
  const save = useSave<AdminZone>((id) => (id ? `/admin/delivery/zones/${id}` : "/admin/delivery/zones"));
  const [draft, setDraft] = useState({ name: "", fee: "5000", minOrder: "0" });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Delivery areas</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Area</TableHead><TableHead>Fee (UGX)</TableHead><TableHead>Minimum order (UGX)</TableHead><TableHead>Active</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {zones.data?.map((z) => (
              <TableRow key={z.id}>
                <TableCell className="font-medium">{z.name}</TableCell>
                <TableCell>
                  <InlineNumber value={z.fee} onSave={(fee) => save.mutate({ id: z.id, body: { fee } })} />
                </TableCell>
                <TableCell>
                  <InlineNumber value={z.minOrder} onSave={(minOrder) => save.mutate({ id: z.id, body: { minOrder } })} />
                </TableCell>
                <TableCell>
                  <Switch checked={z.active} onCheckedChange={(active) => save.mutate({ id: z.id, body: { active } })} aria-label={`${z.name} active`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <form
          className="flex flex-wrap gap-2 items-end mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ body: { name: draft.name.trim(), fee: draft.fee, minOrder: draft.minOrder } }, { onSuccess: () => setDraft({ name: "", fee: "5000", minOrder: "0" }) });
          }}
        >
          <Input placeholder="New area name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-48" />
          <Input placeholder="Fee" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} className="w-28" inputMode="numeric" />
          <Input placeholder="Minimum" value={draft.minOrder} onChange={(e) => setDraft({ ...draft, minOrder: e.target.value })} className="w-28" inputMode="numeric" />
          <Button type="submit" disabled={draft.name.trim().length < 2}><Plus className="h-4 w-4 mr-1" /> Add area</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Slots() {
  const slots = useQuery({ queryKey: ["admin", "delivery", "slots"], queryFn: () => api<AdminSlot[]>("/admin/delivery/slots") });
  const save = useSave<AdminSlot>((id) => (id ? `/admin/delivery/slots/${id}` : "/admin/delivery/slots"));
  const empty = { label: "", startTime: "09:00", endTime: "12:00", capacity: "20", cutoffMinutes: "60" };
  const [draft, setDraft] = useState(empty);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Daily delivery slots (Kampala time)</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label shown to customers</TableHead><TableHead>Window</TableHead><TableHead>Orders per slot</TableHead>
              <TableHead>Closes (min before)</TableHead><TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.data?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.label}</TableCell>
                <TableCell>{s.startTime}–{s.endTime}</TableCell>
                <TableCell><InlineNumber value={String(s.capacity)} onSave={(v) => save.mutate({ id: s.id, body: { capacity: Number(v) } })} /></TableCell>
                <TableCell><InlineNumber value={String(s.cutoffMinutes)} onSave={(v) => save.mutate({ id: s.id, body: { cutoffMinutes: Number(v) } })} /></TableCell>
                <TableCell><Switch checked={s.active} onCheckedChange={(active) => save.mutate({ id: s.id, body: { active } })} aria-label={`${s.label} active`} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <form
          className="flex flex-wrap gap-2 items-end mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              { body: { label: draft.label.trim(), startTime: draft.startTime, endTime: draft.endTime, capacity: Number(draft.capacity), cutoffMinutes: Number(draft.cutoffMinutes) } },
              { onSuccess: () => setDraft(empty) },
            );
          }}
        >
          <Input placeholder="Label, e.g. Evening (6pm-8pm)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="w-60" />
          <Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} className="w-32" />
          <Input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} className="w-32" />
          <Input placeholder="Capacity" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} className="w-24" inputMode="numeric" />
          <Input placeholder="Cutoff" value={draft.cutoffMinutes} onChange={(e) => setDraft({ ...draft, cutoffMinutes: e.target.value })} className="w-24" inputMode="numeric" />
          <Button type="submit" disabled={draft.label.trim().length < 2}><Plus className="h-4 w-4 mr-1" /> Add slot</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Number that saves on blur/Enter when changed. */
function InlineNumber({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const initial = String(Math.round(Number(value)));
  const [v, setV] = useState(initial);
  const commit = () => {
    if (v !== initial && /^\d+$/.test(v)) onSave(v);
    else setV(initial);
  };
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="w-28 h-8"
      inputMode="numeric"
      title={ugx(value)}
    />
  );
}
