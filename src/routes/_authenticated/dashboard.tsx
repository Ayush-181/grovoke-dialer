import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/AppShell";
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

  const { data: leadCounts } = useQuery({
    queryKey: ["lead-counts", workspace?.id],
    enabled: !!workspace,
    queryFn: async () => {
      const { count: total } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace!.id);
      const { count: uncalled } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace!.id)
        .eq("status", "new");
      return { total: total ?? 0, uncalled: uncalled ?? 0 };
    },
  });

  const connectionRate = stats?.calls_total ? (stats.connected / stats.calls_total) * 100 : 0;
  const daily = stats?.daily ?? [];
  const peak = Math.max(1, ...daily.map((d) => d.calls));

  const kpis = [
    { label: "Calls today", value: stats?.calls_today ?? 0 },
    { label: "Calls this week", value: stats?.calls_week ?? 0 },
    { label: "Connection rate", value: `${connectionRate.toFixed(1)}%`, accent: true },
    { label: "Unique leads reached", value: stats?.unique_leads ?? 0 },
    { label: "Leads in workspace", value: leadCounts?.total ?? 0 },
    { label: "Never called", value: leadCounts?.uncalled ?? 0 },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Last 30 days of dialing activity." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
        {daily.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No calls logged yet. Import leads and start a session.
          </p>
        ) : (
          <div className="flex h-40 items-end gap-1">
            {daily.map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center justify-end">
                <span className="mono mb-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {d.calls}
                </span>
                <div
                  className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
                  style={{ height: `${(d.calls / peak) * 100}%` }}
                  title={`${d.day}: ${d.calls} calls`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
