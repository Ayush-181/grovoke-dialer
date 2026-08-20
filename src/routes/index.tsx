import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Call Board — Power Dialer CRM for Local Service Leads" },
      {
        name: "description",
        content:
          "Import lead lists, build calling sessions, and power through them with a browser dialer that logs every call, recording and outcome.",
      },
      { property: "og:title", content: "Call Board — Power Dialer CRM" },
      {
        property: "og:description",
        content: "Dark-industrial B2B power dialer for cold-calling local service businesses.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { initialized, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialized) return;
    void navigate({ to: user ? "/dashboard" : "/auth", replace: true });
  }, [initialized, user, navigate]);

  return (
    <div className="grid-noise flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mono text-2xl font-semibold tracking-tight">CALL BOARD</h1>
        <p className="mt-2 text-sm text-muted-foreground">Loading your workspace…</p>
      </div>
    </div>
  );
}
