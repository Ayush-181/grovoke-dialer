import { ArrowRight, Phone } from "lucide-react";
import type { Page } from "./App";
import type { State } from "./model";
import { isSuppressed, isValidZone, leadPhones } from "./domain";
import { dateAt, timeAt } from "./format";
import { dateKey } from "./metrics";
import { Empty, Panel, PanelHead } from "./components";
import "./mac-overview.css";

type OverviewProps = {
  state: State;
  now: Date;
  navigate: (page: Page) => void;
};

export function OverviewBanner({ state, now, navigate }: OverviewProps) {
  const lead = state.leads.find((item) => item.id === state.selectedId);
  const selected = lead ? state.draft : undefined;
  const blocked =
    selected &&
    (isSuppressed(selected) ||
      leadPhones(selected).some((phone) => state.suppressedNumbers.includes(phone)));
  const queueCount = state.queueIds.filter((id) =>
    state.leads.some((item) => item.id === id),
  ).length;
  return (
    <section className="overview-banner" aria-label="Calling workspace">
      <div className="overview-welcome">
        <p className="overview-eyebrow">{dateAt(now)} · IST</p>
        <h2>Ready for your next conversation?</h2>
        <p>
          {queueCount
            ? `${queueCount} leads in your selected queue.`
            : "Your calling queue is empty."}{" "}
          Take one lead at a time. Save before moving on.
        </p>
        <div className="overview-actions">
          <button className="button overview-start" onClick={() => navigate("dialer")}>
            <Phone aria-hidden="true" size={16} />
            {state.call?.active ? "Return to call" : "Start calling"}
            <ArrowRight aria-hidden="true" size={16} />
          </button>
          <button className="button overview-review" onClick={() => navigate("followups")}>
            Review follow-ups
          </button>
        </div>
        <small>Opens the dialer. You choose when to call.</small>
      </div>
      <div className="overview-next">
        <p className="overview-eyebrow">{state.call?.active ? "Current call" : "Next up"}</p>
        {selected && !state.queueComplete ? (
          <>
            <strong>{selected.business}</strong>
            <span className="mono">{selected.phone || "No phone number saved"}</span>
            <span>{blocked ? "Calling blocked · do not call" : "Selected in your dialer"}</span>
            <span className="mono">
              {isValidZone(selected.zone) ? timeAt(now, selected.zone) : "Time zone unavailable"}
            </span>
          </>
        ) : (
          <>
            <strong>{state.queueComplete ? "Queue complete" : "No lead selected"}</strong>
            <span>Review your leads in the dialer to choose what comes next.</span>
          </>
        )}
      </div>
    </section>
  );
}

export function OverviewSchedule({ state, now, navigate }: OverviewProps) {
  const today = dateKey(now);
  // Calendar arithmetic uses the existing IST reporting date, independent of browser zone.
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
  const meetings = state.bookings
    .filter((item) => days.includes(dateKey(item.at)))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const pending = state.followUps
    .filter((item) => item.status === "pending")
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return (
    <div className="overview-schedule">
      <Panel className="overview-week">
        <PanelHead
          title="This week’s meetings"
          subtitle={`Monday–Sunday · IST · ${meetings.length} meetings`}
          action={
            <button className="text-button" onClick={() => navigate("bookings")}>
              View all <ArrowRight aria-hidden="true" size={14} />
            </button>
          }
        />
        <ol className="overview-week-days" aria-label="This week in IST">
          {days.map((day) => {
            const count = meetings.filter((item) => dateKey(item.at) === day).length;
            return (
              <li key={day} aria-current={day === today ? "date" : undefined}>
                <small>
                  {new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(
                    new Date(`${day}T00:00:00Z`),
                  )}
                </small>
                <strong className="mono">{Number(day.slice(-2))}</strong>
                <span>{count ? `${count} mtg` : "—"}</span>
                {day === today && <small>Today</small>}
              </li>
            );
          })}
        </ol>
        <div
          className="overview-agenda"
          role="region"
          aria-label="This week’s meetings list"
          tabIndex={0}
        >
          {meetings.map((item) => (
            <button
              key={item.id}
              className="overview-agenda-item"
              onClick={() => navigate("bookings")}
            >
              <strong>{item.title}</strong>
              <span>
                {state.leads.find((lead) => lead.id === item.leadId)?.business ??
                  "Lead unavailable"}
              </span>
              <span className="mono">
                {isValidZone(item.zone)
                  ? `${dateAt(item.at, item.zone)} · ${timeAt(item.at, item.zone)}`
                  : "Lead time zone unavailable"}
              </span>
              <span className="mono">
                {dateAt(item.at)} · {timeAt(item.at, "Asia/Kolkata")}
              </span>
              {new Date(item.at) < now && <small>Earlier this week</small>}
            </button>
          ))}
          {!meetings.length && (
            <Empty
              title="No meetings this week"
              description="Saved bookings for this week will appear here."
            />
          )}
        </div>
      </Panel>
      <Panel className="overview-pending">
        <PanelHead
          title="Scheduled follow-ups"
          subtitle={`${pending.length} pending · earliest first`}
          action={
            <button className="text-button" onClick={() => navigate("followups")}>
              View all <ArrowRight aria-hidden="true" size={14} />
            </button>
          }
        />
        <div
          className="overview-agenda"
          role="region"
          aria-label="Scheduled follow-ups list"
          tabIndex={0}
        >
          {pending.map((item) => (
            <button
              key={item.id}
              className="overview-agenda-item"
              onClick={() => navigate("followups")}
            >
              <strong>
                {state.leads.find((lead) => lead.id === item.leadId)?.business ??
                  "Lead unavailable"}
              </strong>
              <span>{item.reason || "Scheduled follow-up"}</span>
              <small>
                {new Date(item.at) < now
                  ? "Overdue"
                  : dateKey(item.at) === today
                    ? "Today · IST"
                    : "Upcoming"}
              </small>
              <span className="mono">
                {isValidZone(item.zone)
                  ? `${dateAt(item.at, item.zone)} · ${timeAt(item.at, item.zone)}`
                  : "Lead time zone unavailable"}
              </span>
              <span className="mono">
                {dateAt(item.at)} · {timeAt(item.at, "Asia/Kolkata")}
              </span>
            </button>
          ))}
          {!pending.length && (
            <Empty
              title="No scheduled follow-ups"
              description="Schedule a follow-up from the dialer or Follow-ups page."
            />
          )}
        </div>
      </Panel>
    </div>
  );
}

export function OverviewAvailability({ state, now, navigate }: OverviewProps) {
  const leadZones = [...new Set(state.leads.map((lead) => lead.zone))];
  return (
    <div className="overview-availability">
      <Panel>
        <PanelHead
          title="Time-zone windows"
          subtitle="Calling window not configured · status unavailable"
          action={
            <button className="text-button" onClick={() => navigate("timezones")}>
              View zones <ArrowRight aria-hidden="true" size={14} />
            </button>
          }
        />
        <div className="overview-zones" role="region" aria-label="Lead time zones" tabIndex={0}>
          {leadZones.map((zone) => (
            <div className="overview-zone" key={zone}>
              <strong>{zone === "Asia/Kolkata" ? "India · IST" : zone || "Unknown zone"}</strong>
              <span className="mono">
                {isValidZone(zone) ? timeAt(now, zone) : "Time unavailable"}
              </span>
              <small>
                {state.leads.filter((lead) => lead.zone === zone).length} leads · window unchecked
              </small>
            </div>
          ))}
          {!leadZones.length && (
            <Empty
              title="No lead time zones"
              description="Saved lead time zones will appear here."
            />
          )}
        </div>
      </Panel>
      <Panel className="overview-usage">
        <PanelHead title="Twilio usage" subtitle="Balance and spend" />
        <Empty
          title="Usage unavailable here"
          description="This workspace view does not receive Twilio usage data. No balance or rate estimate is shown."
        />
      </Panel>
    </div>
  );
}
