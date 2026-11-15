import { useState, type FormEvent, type ReactNode } from "react";
import type { AdminProfile } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "./api";
import { setSession } from "./session";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-muted/30">
      <div className="text-center">
        <div className="font-poppins font-bold text-2xl text-primary">FreshMart</div>
        <div className="text-sm text-muted-foreground">Staff console</div>
      </div>
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {children}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground max-w-sm text-center">Shopping for groceries? Use the FreshMart mobile app.</p>
    </div>
  );
}

export default function SignIn() {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        setSession(await api<AdminProfile>("/admin/auth/login", { method: "POST", body: { email, password } }));
      } else {
        const r = await api<{ message: string }>("/admin/auth/forgot", { method: "POST", body: { email } });
        setInfo(r.message);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: "signin" | "forgot") => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  return (
    <AuthShell
      title={mode === "signin" ? "Sign in" : "Reset your password"}
      subtitle={mode === "forgot" ? "Enter your work email and we'll send you a link to choose a new password." : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        {mode === "signin" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => switchTo("forgot")}>
                Forgot password?
              </button>
            </div>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {info && <p className="text-sm text-primary" role="status">{info}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}
        </Button>
        {mode === "forgot" && (
          <button type="button" className="text-sm text-primary hover:underline w-full" onClick={() => switchTo("signin")}>
            Back to sign in
          </button>
        )}
      </form>
    </AuthShell>
  );
}
