import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import type { AdminProfile } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "./api";
import { setSession } from "./session";
import { AuthShell } from "./SignIn";

/** Landing page for invite and reset emails: /set-password?token=… */
export default function SetPassword() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters");
    if (password !== confirm) return setError("The passwords don't match");
    setError(null);
    setBusy(true);
    try {
      const admin = await api<AdminProfile>("/admin/auth/set-password", { method: "POST", body: { token, password } });
      setSession(admin);
      // Drop the token from the address bar and history.
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Link incomplete" subtitle="Open the link from your email again, or ask for a new one from the sign-in page.">
        <Button className="w-full" onClick={() => navigate("/", { replace: true })}>Go to sign in</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose your password" subtitle="You'll use it with your email to sign in to the staff console.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw2">Type it again</Label>
          <Input id="pw2" type="password" autoComplete="new-password" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save password and sign in"}</Button>
      </form>
    </AuthShell>
  );
}
