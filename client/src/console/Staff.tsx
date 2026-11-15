import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { StaffMember } from "@shared/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { api, fmtDateTime } from "./api";
import { PageHeader } from "./Layout";
import { useAdmin } from "./session";

type Role = StaffMember["role"];
const roleHelp: Record<Role, string> = {
  owner: "Everything, including staff accounts, products, prices and delivery settings.",
  staff: "Orders, transport, stock counts and support issues.",
};

/** Owner-only: invite staff, change roles, switch accounts off. */
export default function Staff() {
  const { admin } = useAdmin();
  const client = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const staff = useQuery({ queryKey: ["admin", "staff"], queryFn: () => api<StaffMember[]>("/admin/staff") });
  const fail = (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; active?: boolean }) => api(`/admin/staff/${id}`, { method: "PATCH", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "staff"] }),
    onError: fail,
  });
  const invite = useMutation({
    mutationFn: (id: string) => api<{ emailed: boolean; message: string }>(`/admin/staff/${id}/invite`, { method: "POST", body: {} }),
    onSuccess: (r) =>
      toast(r.emailed ? { title: "Invite sent", description: r.message } : { title: "Invite not emailed", description: r.message, variant: "destructive" }),
    onError: fail,
  });

  return (
    <div>
      <PageHeader
        title="Staff accounts"
        description="People who can sign in to this console. Switching someone off signs them out straight away."
        actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add staff</Button>}
      />
      {staff.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.data?.map((m) => {
                const self = m.id === admin?.id;
                return (
                  <TableRow key={m.id} className={m.active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{m.name}{self && <span className="text-muted-foreground"> (you)</span>}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>
                      <Select value={m.role} onValueChange={(role) => update.mutate({ id: m.id, role: role as Role })} disabled={self}>
                        <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {!m.active ? <Badge variant="secondary">Switched off</Badge>
                        : !m.hasPassword ? <Badge variant="outline">Invite pending</Badge>
                        : <Badge>Active</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(m.lastLoginAt)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap space-x-1">
                      {m.active && !m.hasPassword && (
                        <Button size="sm" variant="secondary" onClick={() => invite.mutate(m.id)} disabled={invite.isPending}>Resend invite</Button>
                      )}
                      {!self && (
                        <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: m.id, active: !m.active })}>
                          {m.active ? "Switch off" : "Switch on"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {adding && <AddStaffDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const add = useMutation({
    mutationFn: () =>
      api<{ inviteSent: boolean; inviteError?: string }>("/admin/staff", { method: "POST", body: { name, email, role } }),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["admin", "staff"] });
      toast(
        r.inviteSent
          ? { title: "Invite sent", description: `${email} will get an email to set their password.` }
          : { title: "Account added, but the invite email wasn't sent", description: `${r.inviteError} Use "Resend invite" once email works.`, variant: "destructive" },
      );
      onClose();
    },
    onError: (e: Error) => toast({ title: "Couldn't add", description: e.message, variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add staff</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3" id="add-staff">
          <div className="space-y-1">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-email">Work email</Label>
            <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{roleHelp[role]}</p>
          </div>
          <p className="text-sm text-muted-foreground">They'll get an email with a link to choose their own password.</p>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-staff" disabled={add.isPending}>{add.isPending ? "Adding…" : "Send invite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
