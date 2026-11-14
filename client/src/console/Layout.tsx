import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, ListOrdered, Package, Truck, LifeBuoy, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { api } from "./api";
import type { SessionUser } from "@/hooks/useAuth";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/products", label: "Products & stock", icon: Package },
  { href: "/delivery", label: "Delivery", icon: Truck },
  { href: "/issues", label: "Support issues", icon: LifeBuoy },
];

export async function signOut() {
  await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
  queryClient.clear();
  queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
}

export function ConsoleLayout({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [location] = useLocation();
  const active = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  return (
    <div className="min-h-screen bg-muted/30 md:flex">
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r bg-background">
        <div className="px-4 py-4 flex items-center justify-between md:block">
          <div>
            <div className="font-poppins font-bold text-lg text-primary">FreshMart</div>
            <div className="text-xs text-muted-foreground">Staff console</div>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 px-2 pb-2 overflow-x-auto">
          {nav.map(({ href, label, icon: Icon }) => (
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
        <div className="hidden md:block px-4 py-4 mt-4 border-t text-xs text-muted-foreground">
          <div className="truncate">{user.firstName || user.phoneNumber}</div>
          <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-6 max-w-7xl">{children}</main>
    </div>
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
