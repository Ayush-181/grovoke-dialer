import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Call Board" },
      { name: "description", content: "Sign in to your Call Board dialer workspace." },
      { property: "og:title", content: "Sign in — Call Board" },
      { property: "og:description", content: "Access your power-dialer workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { initialized, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialized && user) void navigate({ to: "/dashboard", replace: true });
  }, [initialized, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "sign_up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Setting up your workspace…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid-noise flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-sm p-6 shadow-[var(--shadow-panel)]">
        <div className="mb-6">
          <h1 className="mono text-lg font-semibold tracking-tight">CALL BOARD</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Power-dialer CRM for local service outreach.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="text-xs">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Working…" : mode === "sign_up" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
          className="mt-4 w-full text-center text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          {mode === "sign_in" ? "No account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
