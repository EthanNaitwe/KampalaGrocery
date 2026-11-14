import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PhoneAuth from "@/components/phone-auth";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import { ConsoleLayout, signOut } from "@/console/Layout";
import Dashboard from "@/console/Dashboard";
import Orders from "@/console/Orders";
import Products from "@/console/Products";
import Delivery from "@/console/Delivery";
import Issues from "@/console/Issues";

/**
 * The website is the FreshMart staff console. Customers shop and order in the mobile app.
 */
function Root() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-muted/30">
        <div className="text-center">
          <div className="font-poppins font-bold text-2xl text-primary">FreshMart</div>
          <div className="text-sm text-muted-foreground">Staff console sign-in</div>
        </div>
        <div className="w-full max-w-md">
          <PhoneAuth hideAuthLogin={() => queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] })} />
        </div>
        <p className="text-xs text-muted-foreground max-w-md text-center">Shopping for groceries? Download the FreshMart app.</p>
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md">
          <CardContent className="p-6 space-y-3 text-center">
            <div className="font-poppins font-bold text-xl text-primary">FreshMart</div>
            <p>This site is for FreshMart staff. To shop and place orders, use the FreshMart mobile app with the same phone number. Your cart is saved there.</p>
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ConsoleLayout user={user}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/orders" component={Orders} />
        <Route path="/products" component={Products} />
        <Route path="/delivery" component={Delivery} />
        <Route path="/issues" component={Issues} />
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
