import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/AppShell";
import { TwilioUsageCard } from "@/components/TwilioUsageCard";
import { formatDuration } from "@/lib/outcomes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Call Board" },
      {
        name: "description",
        content: "Monthly dials, pickups, connect rate and booking funnel for your calling workspace.",
      },
      { property: "og:title", content: "Dashboard — Call Board" },
      { property: "og:description", content: "Monthly dialing KPIs, booking funnel and daily trend." },
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
  month_start: string;
  daily: DailyRow[];
};

type Tone = "blue" | "green" | "amber" | "violet";

const TONE: Record<Tone, { card: string; label: string; value: string; bar: string; dot: string }> = {
  blue: {
    card: "border-primary/25 bg-primary/5",
    label: "text-primary/80",
    value: "text-primary",
    bar: "bg-primary/80",
    dot: "bg-primary",
  },
  green: {
    card: "border-success/30 bg-success/10",
    label: "text-success-foreground/70",
    value: "text-success-foreground",
    bar: "bg-success/80",
    dot: "bg-success",
  },
  amber: {
    card: "border-warning/35 bg-warning/10",
    label: "text-warning-foreground/70",
    value: "text-warning-foreground",
    bar: "bg-warning/80",
    dot: "bg-warning",
  },
  violet: {
    card: "border-chart-5/30 bg-chart-5/10",
    label: "text-muted-foreground",
    value: "text-foreground",
    bar: "bg-chart-5/80",
    dot: "bg-chart-5",
  },
};

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("rounded-lg border p-3 shadow-sm", t.card)}>
      <div className={cn("text-[10px] uppercase tracking-widest", t.label)}>{label}</div>
      <div className={cn("mono mt-1 text-2xl font-semibold", t.value)}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={cn("h-2.5 w-2.5 rounded-full", TONE[tone].dot)} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push({
      value: d.toISOString().slice(0, 10),
      label: d.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }),
    });
  }
  return out;
}

function DashboardPage() {
  const { workspace } = useWorkspace();
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(() => months[0]!.value);

  const { data: stats } = useQuery({
    queryKey: ["dashboard", workspace?.id, month],
    enabled: !!workspace,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await supabase.rpc("dashboard_stats", {
        _workspace_id: workspace!.id,
        _month_start: month,
      } as never);
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const s = stats;
  const dials = s?.dials ?? 0;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const rate = (n: number, d: number) => `${pct(n, d).toFixed(1)}%`;

  // Full calendar month axis
  const [y, m] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map((s?.daily ?? []).map((d) => [d.day, d]));
  const series = Array.from({ length: daysInMonth }, (_, i) => {
    const day = `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
    const row = byDay.get(day);
    return {
      day,
      dayNum: i + 1,
      dials: row?.dials ?? 0,
      calls: row?.calls ?? 0,
      connect_rate: Number(row?.connect_rate ?? 0),
    };
  });
  const peak = Math.max(1, ...series.map((d) => d.dials));
  const hasData = (s?.calls_total ?? 0) > 0;

  const funnel: { label: string; value: number }[] = [
    { label: "Dials", value: dials },
    { label: "Pickups", value: s?.pickups ?? 0 },
    { label: "Triage Held", value: s?.triage_held ?? 0 },
    { label: "Offered", value: s?.appointments_offered ?? 0 },
    { label: "Booked", value: s?.appointments_booked ?? 0 },
  ];

  // Chart geometry
  const W = 720;
  const H = 200;
  const PAD_B = 18;
  const plotH = H - PAD_B;
  const bw = W / series.length;
  const linePoints = series
    .map((d, i) => {
      const x = i * bw + bw / 2;
      const yy = plotH - (Math.min(100, d.connect_rate) / 100) * plotH;
      return `${x.toFixed(1)},${yy.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Monthly dialing performance for this workspace."
        actions={
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-8 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            {months.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />

      <Section title="Volume" tone="blue">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Dials" value={dials} tone="blue" />
          <Kpi label="Pickups" value={s?.pickups ?? 0} tone="blue" />
          <Kpi label="Connect rate" value={rate(s?.pickups ?? 0, dials)} tone="blue" />
          <Kpi label="Calls today" value={s?.calls_today ?? 0} tone="blue" />
          <Kpi label="Avg call length" value={formatDuration(s?.avg_duration_seconds ?? 0)} tone="blue" />
          <Kpi label="Total talk time" value={formatDuration(s?.total_talk_seconds ?? 0)} tone="blue" />
        </div>
      </Section>

      <Section title="Connect Quality" tone="amber">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi
            label="DM reached"
            value={s?.dm_reached ?? 0}
            sub={`${rate(s?.dm_reached ?? 0, dials)} of dials`}
            tone="amber"
          />
          <Kpi
            label="Gatekeeper"
            value={rate(s?.gatekeeper ?? 0, dials)}
            sub={`${s?.gatekeeper ?? 0} calls`}
            tone="amber"
          />
          <Kpi
            label="Voicemail"
            value={rate(s?.voicemail ?? 0, dials)}
            sub={`${s?.voicemail ?? 0} calls`}
            tone="amber"
          />
          <Kpi label="Not interested" value={s?.not_interested ?? 0} tone="amber" />
          <Kpi label="Do not call" value={s?.do_not_call ?? 0} tone="amber" />
          <Kpi label="Bad number" value={s?.bad_number ?? 0} tone="amber" />
        </div>
      </Section>

      <Section title="Booking Funnel" tone="green">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Triage held" value={s?.triage_held ?? 0} tone="green" />
          <Kpi label="Appointments offered" value={s?.appointments_offered ?? 0} tone="green" />
          <Kpi label="Appointments booked" value={s?.appointments_booked ?? 0} tone="green" />
          <Kpi
            label="Offer-to-book rate"
            value={rate(s?.appointments_booked ?? 0, s?.appointments_offered ?? 0)}
            tone="green"
          />
        </div>

        <div className="mt-3 space-y-2 rounded-lg border border-success/30 bg-success/5 p-4">
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
                    className="flex h-7 items-center rounded-md bg-success/80 px-2"
                    style={{ width: `${width}%` }}
                  >
                    <span className="mono text-xs font-semibold text-success-foreground">
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

      <Section title="Daily Activity" tone="violet">
        <div className="panel p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Dials &amp; connect rate</h3>
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-primary/70" /> dials (peak {peak})
              </span>
              <span className="flex items-center gap-1">
                <span className="h-0.5 w-4 bg-success" /> connect rate %
              </span>
            </div>
          </div>

          {!hasData ? (
            <p className="py-12 text-center text-xs text-muted-foreground">
              No calls logged in this month.
            </p>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full">
              {[0, 25, 50, 75, 100].map((g) => (
                <line
                  key={g}
                  x1={0}
                  x2={W}
                  y1={plotH - (g / 100) * plotH}
                  y2={plotH - (g / 100) * plotH}
                  className="stroke-border"
                  strokeWidth={1}
                />
              ))}
              {series.map((d, i) => {
                const h = d.dials ? Math.max(2, (d.dials / peak) * plotH) : 0;
                return (
                  <g key={d.day}>
                    <rect
                      x={i * bw + bw * 0.2}
                      y={plotH - h}
                      width={bw * 0.6}
                      height={h}
                      rx={2}
                      className="fill-primary/70"
                    >
                      <title>{`${d.day}: ${d.dials} dials · ${d.connect_rate}% connect`}</title>
                    </rect>
                    {d.dayNum % 5 === 0 && (
                      <text
                        x={i * bw + bw / 2}
                        y={H - 4}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        style={{ fontSize: 9 }}
                      >
                        {d.dayNum}
                      </text>
                    )}
                  </g>
                );
              })}
              <polyline
                points={linePoints}
                fill="none"
                className="stroke-success"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>
      </Section>

      <TwilioUsageCard />
    </div>
  );
}
