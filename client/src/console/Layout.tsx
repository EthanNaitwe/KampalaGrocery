import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { KeyRound, LayoutDashboard, Tags, ListOrdered, LogOut, LifeBuoy, Package, Truck, Users } from "lucide-react";
import type { AdminProfile } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "./api";
import { signOut } from "./session";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/products", label: "Products & stock", icon: Package },
  { href: "/categories", label: "Categories", icon: Tags, ownerOnly: true },
  { href: "/delivery", label: "Delivery", icon: Truck, ownerOnly: true },
  { href: "/issues", label: "Support issues", icon: LifeBuoy },
  { href: "/staff", label: "Staff accounts", icon: Users, ownerOnly: true },
];

export function ConsoleLayout({ admin, children }: { admin: AdminProfile; children: ReactNode }) {
  const [location] = useLocation();
  const [changing, setChanging] = useState(false);
  const active = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));
  const items = nav.filter((n) => !n.ownerOnly || admin.role === "owner");

  return (
    <div className="min-h-screen bg-muted/30 md:flex">
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r bg-background">
        <div className="px-4 py-4 flex items-center justify-between md:block">
          <div>
            <div className="font-poppins font-bold text-lg text-primary">FreshMart</div>
            <div className="text-xs text-muted-foreground">Staff console</div>
          </div>
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
        <nav className="flex md:flex-col gap-1 px-2 pb-2 overflow-x-auto">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap ${
                active(href) ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:block px-4 py-4 mt-4 border-t text-xs text-muted-foreground space-y-1">
          <div className="font-medium text-foreground truncate">{admin.name}</div>
          <div className="truncate">{admin.email}</div>
          <div className="capitalize">{admin.role}</div>
          <div className="flex flex-col items-start pt-1">
            <Button variant="ghost" size="sm" className="px-0" onClick={() => setChanging(true)}>
              <KeyRound className="h-4 w-4 mr-1" /> Change password
            </Button>
            <Button variant="ghost" size="sm" className="px-0" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-6 max-w-7xl">{children}</main>
      {changing && <ChangePasswordDialog onClose={() => setChanging(false)} />}
    </div>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("Use at least 8 characters");
    if (next !== confirm) return setError("The new passwords don't match");
    setBusy(true);
    setError(null);
    try {
      await api("/admin/auth/password", { method: "PUT", body: { currentPassword: current, password: next } });
      toast({ title: "Password changed", description: "You've been signed out on your other devices." });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader>
        <form id="change-pw" onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" autoComplete="new-password" maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new2">Type it again</Label>
            <Input id="new2" type="password" autoComplete="new-password" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="change-pw" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-poppins font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
