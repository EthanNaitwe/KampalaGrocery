import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ConsoleLayout } from "@/console/Layout";
import { useAdmin } from "@/console/session";
import SignIn from "@/console/SignIn";
import SetPassword from "@/console/SetPassword";
import Dashboard from "@/console/Dashboard";
import Orders from "@/console/Orders";
import Products from "@/console/Products";
import Delivery from "@/console/Delivery";
import Issues from "@/console/Issues";
import Staff from "@/console/Staff";

/**
 * The website is the FreshMart staff console (email + password accounts, separate from customers).
 * Customers shop and order in the mobile app.
 */
function Root() {
  const { admin, isLoading } = useAdmin();

  // Invite and reset links work whether or not someone is signed in on this browser.
  if (window.location.pathname === "/set-password") return <SetPassword />;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" aria-label="Loading" />
      </div>
    );
  }

  if (!admin) return <SignIn />;

  return (
    <ConsoleLayout admin={admin}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/orders" component={Orders} />
        <Route path="/products" component={Products} />
        <Route path="/issues" component={Issues} />
        {admin.role === "owner" && <Route path="/delivery" component={Delivery} />}
        {admin.role === "owner" && <Route path="/staff" component={Staff} />}
        <Route component={NotFound} />
      </Switch>
    </ConsoleLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Root />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
