import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/AppShell";
import { TwilioUsageCard } from "@/components/TwilioUsageCard";
import { OUTCOMES, outcomeLabel, formatDuration } from "@/lib/outcomes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Call Board" },
      {
        name: "description",
        content: "Dials, pickups, connect rate and booking funnel for your calling workspace.",
      },
      { property: "og:title", content: "Dashboard — Call Board" },
      { property: "og:description", content: "Live dialing KPIs, booking funnel and daily trends." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

type DailyRow = {
  day: string;
  calls: number;
  dials: number;
  pickups: number;
  connect_rate: number;
};

type Stats = {
  calls_today: number;
  calls_total: number;
  unique_leads: number;
  dials: number;
  pickups: number;
  connected: number;
  dm_reached: number;
  gatekeeper: number;
  connected_other: number;
  voicemail: number;
  no_answer: number;
  busy: number;
  not_interested: number;
  callback_requested: number;
  do_not_call: number;
  bad_number: number;
  dialed: number;
  triage_held: number;
  appointments_offered: number;
  appointments_booked: number;
  total_talk_seconds: number;
  avg_duration_seconds: number;
  daily: DailyRow[];
};

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mono mt-1 text-2xl font-semibold",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

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

  const s = stats;
  const dials = s?.dials ?? 0;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const rate = (n: number, d: number) => `${pct(n, d).toFixed(1)}%`;

  const daily = s?.daily ?? [];
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - (29 - i));
    const day = dt.toISOString().slice(0, 10);
    const row = byDay.get(day);
    return {
      day,
      calls: row?.calls ?? 0,
      connect_rate: Number(row?.connect_rate ?? 0),
      dials: row?.dials ?? 0,
    };
  });
  const peak = Math.max(1, ...last30.map((d) => d.calls));

  const funnel = [
    { label: "Dials", value: dials },
    { label: "Pickups", value: s?.pickups ?? 0 },
    { label: "Triage Held", value: s?.triage_held ?? 0 },
    { label: "Offered", value: s?.appointments_offered ?? 0 },
    { label: "Booked", value: s?.appointments_booked ?? 0 },
  ];

  const OUTCOME_STAT_KEY: Record<string, keyof Stats> = {
    connected_dm: "dm_reached",
    connected_gk: "gatekeeper",
    connected_other: "connected_other",
    appointment_set: "appointments_booked",
    callback_requested: "callback_requested",
    voicemail: "voicemail",
    busy: "busy",
    no_answer: "no_answer",
    dialed: "dialed",
    not_interested: "not_interested",
    bad_number: "bad_number",
    do_not_call: "do_not_call",
  };
  const outcomeCounts: { label: string; value: number }[] = OUTCOMES.map((o) => ({
    label: outcomeLabel(o.value),
    value: (s?.[OUTCOME_STAT_KEY[o.value]!] as number) ?? 0,
  })).filter((r) => r.value > 0);

  const outcomeTotal = outcomeCounts.reduce((a, b) => a + b.value, 0);
  const outcomeMax = Math.max(1, ...outcomeCounts.map((r) => r.value));

  // Connect-rate trend line (SVG polyline, 0-100% scale)
  const W = 600;
  const H = 120;
  const points = last30
    .map((d, i) => {
      const x = (i / Math.max(1, last30.length - 1)) * W;
      const y = H - (Math.min(100, d.connect_rate) / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const hasData = (s?.calls_total ?? 0) > 0;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Last 30 days of dialing activity." />

      <Section title="Volume">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Total dials" value={dials} />
          <Kpi label="Calls today" value={s?.calls_today ?? 0} />
          <Kpi label="Pickups" value={s?.pickups ?? 0} />
          <Kpi label="Connect rate" value={rate(s?.pickups ?? 0, dials)} accent />
          <Kpi label="Unique leads reached" value={s?.unique_leads ?? 0} />
          <Kpi
            label="Avg call length"
            value={formatDuration(s?.avg_duration_seconds ?? 0)}
          />
          <Kpi label="Total talk time" value={formatDuration(s?.total_talk_seconds ?? 0)} />
          <Kpi label="All calls logged" value={s?.calls_total ?? 0} />
        </div>
      </Section>

      <Section title="Connect Quality">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi
            label="DM reached"
            value={s?.dm_reached ?? 0}
            sub={`${rate(s?.dm_reached ?? 0, dials)} of dials`}
            accent
          />
          <Kpi
            label="Gatekeeper"
            value={s?.gatekeeper ?? 0}
            sub={`${rate(s?.gatekeeper ?? 0, dials)} of dials`}
          />
          <Kpi
            label="Voicemail"
            value={s?.voicemail ?? 0}
            sub={`${rate(s?.voicemail ?? 0, dials)} of dials`}
          />
          <Kpi label="Not interested" value={s?.not_interested ?? 0} />
          <Kpi label="Do not call" value={s?.do_not_call ?? 0} />
          <Kpi label="Bad number" value={s?.bad_number ?? 0} />
        </div>
      </Section>

      <Section title="Booking Funnel">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Triage held" value={s?.triage_held ?? 0} />
          <Kpi label="Appointments offered" value={s?.appointments_offered ?? 0} />
          <Kpi label="Appointments booked" value={s?.appointments_booked ?? 0} accent />
          <Kpi
            label="Offer-to-book rate"
            value={rate(s?.appointments_booked ?? 0, s?.appointments_offered ?? 0)}
          />
        </div>

        <div className="panel mt-3 space-y-2 p-4">
          {funnel.map((step, i) => {
            const top = funnel[0]?.value ?? 0;
            const prev = i > 0 ? (funnel[i - 1]?.value ?? 0) : null;
            const width = top > 0 ? Math.max(2, (step.value / top) * 100) : 2;
            return (
              <div key={step.label} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-[11px] uppercase tracking-widest text-muted-foreground">
                  {step.label}
                </div>
                <div className="h-7 flex-1 rounded-md bg-muted/40">
                  <div
                    className="flex h-7 items-center rounded-md bg-primary/80 px-2"
                    style={{ width: `${width}%` }}
                  >
                    <span className="mono text-xs font-semibold text-primary-foreground">
                      {step.value}
                    </span>
                  </div>
                </div>
                <div className="mono w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                  {prev !== null && prev > 0 ? `${pct(step.value, prev).toFixed(0)}%` : "—"}
                </div>
              </div>
            );
          })}
          <p className="pt-1 text-[11px] text-muted-foreground">
            Right-hand figure is the conversion from the previous step.
          </p>
        </div>
      </Section>

      <Section title="Trends">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="panel p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Calls per day</h3>
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                peak {peak}
              </span>
            </div>
            {!hasData ? (
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

          <div className="panel p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Connect rate trend</h3>
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                daily %
              </span>
            </div>
            {!hasData ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                No calls logged yet.
              </p>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none">
                {[0, 25, 50, 75, 100].map((g) => (
                  <line
                    key={g}
                    x1={0}
                    x2={W}
                    y1={H - (g / 100) * H}
                    y2={H - (g / 100) * H}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                ))}
                <polyline
                  points={points}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{last30[0]?.day}</span>
              <span>{last30[last30.length - 1]?.day}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Outcome Mix">
        <div className="panel p-4">
          {outcomeTotal === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No dispositioned calls yet.
            </p>
          ) : (
            <div className="space-y-2">
              {outcomeCounts.map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <div className="w-36 shrink-0 truncate text-xs text-muted-foreground">
                    {r.label}
                  </div>
                  <div className="h-4 flex-1 rounded bg-muted/40">
                    <div
                      className="h-4 rounded bg-primary/70"
                      style={{ width: `${Math.max(2, (r.value / outcomeMax) * 100)}%` }}
                    />
                  </div>
                  <div className="mono w-20 shrink-0 text-right text-xs">
                    {r.value} · {pct(r.value, outcomeTotal).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <TwilioUsageCard />
    </div>
  );
}
