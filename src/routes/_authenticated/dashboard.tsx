import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/AppShell";
import { TwilioUsageCard } from "@/components/TwilioUsageCard";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Call Board" },
      {
        name: "description",
        content: "Connection rate, unique leads reached and daily call volume for your workspace.",
      },
      { property: "og:title", content: "Dashboard — Call Board" },
      { property: "og:description", content: "Live dialing KPIs and daily call volume." },
    ],
  }),
  component: DashboardPage,
});

type Stats = {
  calls_today: number;
  calls_week: number;
  calls_month: number;
  calls_total: number;
  unique_leads: number;
  connected: number;
  daily: { day: string; calls: number }[];
};

function DashboardPage() {
  const { workspace } = useWorkspace();

  const { data: stats } = useQuery({
    queryKey: ["dashboard", workspace?.id],
    enabled: !!workspace,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await supabase.rpc("dashboard_stats", {
        _workspace_id: workspace!.id,
      });
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const { data: outcomes } = useQuery({
    queryKey: ["outcome-mix", workspace?.id],
    enabled: !!workspace,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dial_call_logs")
        .select("outcome")
        .eq("workspace_id", workspace!.id);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) counts[r.outcome ?? "none"] = (counts[r.outcome ?? "none"] ?? 0) + 1;
      return { counts, total: data?.length ?? 0 };
    },
  });

  const total = outcomes?.total ?? 0;
  const c = outcomes?.counts ?? {};
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const connected =
    (c['connected_dm'] ?? 0) +
    (c['connected_gk'] ?? 0) +
    (c['connected_other'] ?? 0) +
    (c['appointment_set'] ?? 0) +
    (c['callback_requested'] ?? 0);

  const daily = stats?.daily ?? [];
  const peak = Math.max(1, ...daily.map((d) => d.calls));
  const byDay = new Map(daily.map((d) => [d.day, d.calls]));
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - (29 - i));
    const day = dt.toISOString().slice(0, 10);
    return { day, calls: byDay.get(day) ?? 0 };
  });


  const kpis = [
    { label: "Total calls made", value: total },
    { label: "Calls today", value: stats?.calls_today ?? 0 },
    { label: "Connection rate", value: `${pct(connected).toFixed(1)}%`, accent: true },
    { label: "DM reached rate", value: `${pct(c['connected_dm'] ?? 0).toFixed(1)}%` },
    { label: "Gatekeeper rate", value: `${pct(c['connected_gk'] ?? 0).toFixed(1)}%` },
    { label: "Voicemail rate", value: `${pct(c['voicemail'] ?? 0).toFixed(1)}%` },
    { label: "Unique leads reached", value: stats?.unique_leads ?? 0 },
    { label: "Appointments set", value: c['appointment_set'] ?? 0 },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Last 30 days of dialing activity." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="panel p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {k.label}
            </div>
            <div
              className={cn(
                "mono mt-1 text-2xl font-semibold",
                k.accent ? "text-primary" : "text-foreground",
              )}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>


      <div className="panel mt-4 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Calls per day</h2>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            peak {peak}
          </span>
        </div>
        {total === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No calls logged yet. Import leads and start a session.
          </p>
        ) : (
          <div className="flex h-40 items-end gap-1">
            {last30.map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center justify-end">
                <span className="mono mb-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {d.calls}
                </span>
                <div
                  className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
                  style={{
                    height: d.calls ? `${Math.max(6, (d.calls / peak) * 100)}%` : "2px",
                    opacity: d.calls ? 1 : 0.25,
                  }}
                  title={`${d.day}: ${d.calls} calls`}
                />
              </div>
            ))}
          </div>
        )}

      </div>

      <TwilioUsageCard />
    </div>

  );
}
