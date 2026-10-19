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
  const pickups =
    m.connected +
    logs.filter(
      (log) => log.outcome === "not_interested" && !log.triage && !log.offered && !log.booked,
    ).length;
  const stages = [
    ["Dials", m.dials],
    ["Pickups", pickups],
    ["Conversations", m.connected],
    ["Offered", m.offered],
    ["Booked", m.booked],
  ] as const;
  return (
    <Panel className="funnel-panel">
      <PanelHead title="Booking funnel" subtitle="From first dial to next steps" />
      <div className="funnel">
        {stages.map(([label, count], i) => (
          <div className="funnel-row" key={label}>
            <div className="funnel-stage">
              <svg
                viewBox="0 0 100 44"
                role="img"
                aria-label={`${label}: ${count}, ${m.dials ? Math.round((count / m.dials) * 100) : 0}% of dials`}
                style={{ width: `${100 - i * 13}%` }}
              >
                <path
                  className={`funnel-fill stage-${i}`}
                  d="M5 0 H95 Q100 0 98 6 L86 40 Q85 44 80 44 H20 Q15 44 14 40 L2 6 Q0 0 5 0 Z"
                />
              </svg>
            </div>
            <strong className="mono">{count}</strong>
            <span>{label}</span>
            <small>{m.dials ? Math.round((count / m.dials) * 100) : 0}%</small>
          </div>
        ))}
      </div>
      <p className="funnel-note">
        <span className="status-dot" />
        {m.dials ? ((m.booked / m.dials) * 100).toFixed(1) : "0"}% of dials become bookings
      </p>
    </Panel>
  );
}

export function OverviewActivityChart({ logs, month }: { logs: Log[]; month: string }) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const data = weekdays.map((weekday) =>
    metrics(
      logs.filter(
        (log) =>
          new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "Asia/Kolkata" }).format(
            new Date(log.at),
          ) === weekday,
      ),
    ),
  );
  const max = Math.max(4, Math.ceil(Math.max(...data.map((day) => day.dials)) / 4) * 4);
  const monthLabel = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  return (
    <Panel className="activity-chart">
      <PanelHead title="Calling activity" subtitle="Every conversation starts with a dial" />
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
          Bookings
        </span>
      </div>
      <figure
        className="chart-figure"
        aria-label={`Monthly totals grouped by weekday for ${month}: ${metrics(logs).dials} dials, ${metrics(logs).connected} connected, ${metrics(logs).booked} bookings`}
      >
        <div className="bar-chart">
          <div className="chart-axis">
            {[max, max * 0.75, max * 0.5, max * 0.25, 0].map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <div className="chart-columns">
            {data.map((day, i) => (
              <div className="chart-day" key={weekdays[i]}>
                <div className="bar-group">
                  {[day.dials, day.connected, day.booked].map((count, j) => (
                    <span
                      key={j}
                      className={`bar ${["series-blue", "series-jade", "series-amber"][j]}`}
                      style={{
                        height: `${(count / max) * 100}%`,
                        minHeight: count ? undefined : 0,
                      }}
                      title={`${weekdays[i]}: ${count} ${["dials", "connected", "bookings"][j]}`}
                    />
                  ))}
                </div>
                <small>
                  {weekdays[i]}
                  <span>{monthLabel}</span>
                </small>
              </div>
            ))}
          </div>
        </div>
        <figcaption>
          {logs.length
            ? "Monthly totals grouped by weekday · IST."
            : "No calls recorded for this month. Monthly totals grouped by weekday · IST."}
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
