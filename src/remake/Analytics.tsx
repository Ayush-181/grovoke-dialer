import { Phone, Users, CalendarDays, Clock3, Check, RotateCcw, TrendingUp } from "lucide-react";
import { Panel, PanelHead } from "./components";
import { formatDuration } from "../lib/outcomes";
import { metrics, inPeriod } from "./metrics";
import type { Log } from "./model";

export function MetricsGrid({ logs, detailed = false }: { logs: Log[]; detailed?: boolean }) {
  const m = metrics(logs);
  const items = [
    { label: "Dials", value: m.dials, icon: Phone, tone: "blue" },
    { label: "Connected", value: m.connected, icon: Users, tone: "jade" },
    { label: "Triage held", value: m.triage, icon: Check, tone: "teal" },
    { label: "Appointments offered", value: m.offered, icon: CalendarDays, tone: "blue" },
    { label: "Appointments booked", value: m.booked, icon: CalendarDays, tone: "amber" },
    { label: "Callbacks", value: m.callbacks, icon: RotateCcw, tone: "coral" },
    { label: "Connection rate", value: `${m.connectionRate}%`, icon: TrendingUp, tone: "jade" },
    { label: "Talk time", value: formatDuration(m.talk), icon: Clock3, tone: "blue" },
  ];
  return (
    <div
      className="analytics-metrics"
      aria-label={detailed ? "Daily call metrics" : "Monthly call metrics"}
    >
      {items.map(({ label, value, icon: Icon, tone }) => (
        <Panel className="metric-card" key={label}>
          <span className={`metric-icon ${tone}`}>
            <Icon aria-hidden="true" size={19} />
          </span>
          <span className="metric-label">{label}</span>
          <strong className="mono" data-metric={label}>
            {value}
          </strong>
        </Panel>
      ))}
      {detailed && (
        <div className="outcome-metrics">
          {[
            ["Decision maker", m.decisionMaker],
            ["Gatekeeper", m.gatekeeper],
            ["Other connection", m.other],
            ["Busy", m.busy],
            ["Dialed only", m.dialedOnly],
            ["Awaiting outcome", m.pending],
            ["Voicemail", m.voicemail],
            ["No answer", m.noAnswer],
            ["Not interested", m.notInterested],
            ["Bad number", m.badNumber],
            ["Do not call", m.doNotCall],
            ["Average call", formatDuration(m.average)],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong className="mono">{value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Funnel({ logs }: { logs: Log[] }) {
  const m = metrics(logs);
  const stages = [
    ["Dials", m.dials],
    ["Connected", m.connected],
    ["Triage held", m.triage],
    ["Offered", m.offered],
    ["Booked", m.booked],
  ] as const;
  return (
    <Panel className="funnel-panel">
      <PanelHead title="Booking funnel" subtitle="Each connected call counts once" />
      <figure
        className="connected-funnel"
        aria-label={stages.map(([label, count]) => `${label}: ${count}`).join(". ")}
      >
        <svg viewBox="0 0 240 250" aria-hidden="true" preserveAspectRatio="none">
          {stages.map(([,], i) => {
            const x = i * 18,
              next = (i + 1) * 18;
            return (
              <polygon
                key={i}
                className={`funnel-fill stage-${i}`}
                points={`${x},${i * 50} ${240 - x},${i * 50} ${240 - next},${(i + 1) * 50} ${next},${(i + 1) * 50}`}
              />
            );
          })}
        </svg>
        <div className="funnel-labels">
          {stages.map(([label, count]) => (
            <div key={label}>
              <span>{label}</span>
              <strong className="mono">{count}</strong>
              <small>{m.dials ? Math.round((count / m.dials) * 100) : 0}%</small>
            </div>
          ))}
        </div>
        <figcaption>
          Milestone totals can overlap. Colors mark stages; widths show their order.
        </figcaption>
      </figure>
    </Panel>
  );
}

export function PeriodChart({
  logs,
  period,
  annual = false,
}: {
  logs: Log[];
  period: string;
  annual?: boolean;
}) {
  const slots = annual
    ? 12
    : new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate();
  const data = Array.from({ length: slots }, (_, index) => {
    const key = `${period}-${String(index + 1).padStart(2, "0")}`;
    return metrics(inPeriod(logs, key));
  });
  const max = Math.max(1, ...data.map((day) => day.dials));
  return (
    <figure
      className="period-chart"
      aria-label={`${annual ? "Monthly" : "Daily"} dials, connections and bookings for ${period}`}
    >
      <div className="chart-legend">
        <span>
          <i className="series-blue" />
          Dials
        </span>
        <span>
          <i className="series-jade" />
          Connected
        </span>
        <span>
          <i className="series-amber" />
          Booked
        </span>
      </div>
      <div className="period-bars">
        {data.map((day, i) => (
          <div
            key={i}
            className="period-slot"
            title={`${annual ? new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(2026, i, 1)) : i + 1}: ${day.dials} dials, ${day.connected} connected, ${day.booked} booked`}
          >
            <div>
              {[day.dials, day.connected, day.booked].map((value, j) => (
                <span
                  key={j}
                  className={["series-blue", "series-jade", "series-amber"][j]}
                  style={{ height: `${(value / max) * 100}%` }}
                />
              ))}
            </div>
            <small>
              {annual
                ? new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(2026, i, 1))
                : i === 0 || (i + 1) % 5 === 0 || i === slots - 1
                  ? i + 1
                  : ""}
            </small>
          </div>
        ))}
      </div>
      <figcaption>
        {metrics(logs).dials} dials · {metrics(logs).connected} connected · {metrics(logs).booked}{" "}
        booked. Dates use IST.
      </figcaption>
      {!logs.length && <p className="chart-empty">No calls in this period.</p>}
    </figure>
  );
}
