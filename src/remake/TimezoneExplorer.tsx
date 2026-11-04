import { useState } from "react";
import { Panel, Field } from "./components";
import type { State } from "./model";
import { ZONES, toDateTimeLocalValue, instantToWallClock, zoneOffsetMs } from "../lib/timezones";
import { bookingInstants } from "../lib/booking-time";
import { timeAt, dateAt } from "./format";

export function TimezoneExplorer({ state, now }: { state: State; now: Date }) {
  const key = `callboard-anchor:${state.preferences.email || "local"}`;
  const [anchor, setAnchor] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return ZONES.some((z) => z.id === saved) ? saved! : "Asia/Kolkata";
    } catch {
      return "Asia/Kolkata";
    }
  });
  const [fixed, setFixed] = useState<Date | null>(null);
  const [input, setInput] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const candidates = input ? bookingInstants(input, anchor) : [];
  const value = fixed ?? now;
  const error =
    input !== null &&
    (!candidates.length
      ? "This time does not exist. Choose a valid local time."
      : candidates.length > 1 && choice === ""
        ? "This time occurs twice. Choose an occurrence."
        : "");
  function select(zone: string) {
    if (error) return;
    setAnchor(zone);
    setInput(null);
    setChoice("");
    try {
      localStorage.setItem(key, zone);
    } catch {
      /* Current selection still works. */
    }
  }
  return (
    <>
      <Panel className="timezone-anchor">
        <div>
          <span className="eyebrow">ANCHOR · {ZONES.find((z) => z.id === anchor)?.label}</span>
          <h2>{timeAt(value, anchor)}</h2>
          <p>{dateAt(value, anchor)}</p>
        </div>
        <Field
          label={`Compare a date & time in ${anchor === "Asia/Kolkata" ? "IST" : anchor}`}
          type="datetime-local"
          value={input ?? toDateTimeLocalValue(value, anchor)}
          onChange={(e) => {
            setInput(e.target.value);
            setChoice("");
            setFixed(value);
            const options = bookingInstants(e.target.value, anchor);
            if (options.length === 1) setFixed(options[0]!);
          }}
        />
        <button
          className="button"
          onClick={() => {
            setFixed(null);
            setInput(null);
            setChoice("");
          }}
        >
          Use now
        </button>
      </Panel>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {candidates.length > 1 && (
        <label className="field">
          <span>Repeated time</span>
          <select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              if (e.target.value !== "") setFixed(candidates[Number(e.target.value)]!);
            }}
          >
            <option value="">Choose occurrence</option>
            {candidates.map((date, i) => (
              <option value={i} key={date.toISOString()}>
                {i === 0 ? "First" : "Second"} · {timeAt(date, "Asia/Kolkata")} IST
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="timezone-grid">
        {ZONES.slice(0, 6).map((zone) => {
          const wall = instantToWallClock(value, zone.id);
          const weekday = new Intl.DateTimeFormat("en", {
            timeZone: zone.id,
            weekday: "short",
          }).format(value);
          const offset =
            (zoneOffsetMs(new Date(Math.floor(value.getTime() / 1000) * 1000), zone.id) -
              zoneOffsetMs(new Date(Math.floor(value.getTime() / 1000) * 1000), anchor)) /
            3600000;
          return (
            <Panel key={zone.id} className="timezone-card">
              <button
                className="mx-zone-button"
                aria-pressed={anchor === zone.id}
                disabled={Boolean(error)}
                onClick={() => select(zone.id)}
              >
                <span className="eyebrow">
                  {zone.label} {zone.home ? "· Home" : ""} {anchor === zone.id ? "· Anchor" : ""}
                </span>
                <h2 className="mono">{timeAt(value, zone.id)}</h2>
                <p>{dateAt(value, zone.id)}</p>
                <small>
                  {offset >= 0 ? "+" : ""}
                  {offset}h from anchor · {state.leads.filter((l) => l.zone === zone.id).length}{" "}
                  leads
                </small>
                <div className="mx-hours" aria-label="Local hours: weekdays 9 AM–5 PM">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span
                      key={hour}
                      className={`${hour >= 9 && hour < 17 && weekday !== "Sat" && weekday !== "Sun" ? "open" : ""} ${hour === wall.hour ? "now" : ""}`}
                      title={`${hour}:00 local`}
                    />
                  ))}
                </div>
                <small>00 · 06 · 12 · 18 · 24 — weekdays 9–5</small>
              </button>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
