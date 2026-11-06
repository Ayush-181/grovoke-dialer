import { ArrowRight, Phone } from "lucide-react";
import type { Page } from "./App";
import type { State } from "./model";
import { isSuppressed, isValidZone, leadPhones } from "./domain";
import { dateAt, timeAt } from "./format";
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
