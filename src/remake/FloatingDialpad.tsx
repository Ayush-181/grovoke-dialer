import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Minus, X, Delete } from "lucide-react";
import type { Action, State } from "./model";
import { isDirty, zones } from "./model";
import { useRuntime } from "./runtime";
import { deriveLeadZone } from "../lib/timezones";
import { OUTCOMES, formatDuration } from "../lib/outcomes";
import { parseDialpad, callingHours, suppressedNumber } from "./mac-logic";
import { dialNumber } from "./numbers";
import { timeAt } from "./format";

export function FloatingDialpad({
  open,
  onClose,
  prefill,
  state,
  dispatch,
  guarded,
  now,
}: {
  open: boolean;
  onClose: () => void;
  prefill: string;
  state: State;
  dispatch: (action: Action) => Promise<boolean>;
  guarded: (action: () => void) => void;
  now: Date;
}) {
  const runtime = useRuntime();
  const [value, setValue] = useState("");
  const [country, setCountry] = useState("1");
  const [override, setOverride] = useState("");
  const [error, setError] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ownCall, setOwnCall] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      setMinimized(false);
      input.current?.focus();
    } else previousFocus.current?.focus();
  }, [open]);
  useEffect(() => {
    setValue(prefill);
    setCountry(prefill.startsWith("+91") ? "91" : prefill.startsWith("+44") ? "44" : "1");
    setOverride("");
  }, [prefill, open]);
  const active = Boolean(state.call?.active);
  const number = parseDialpad(value, country);
  const matched = state.leads.find(
    (l) => number && (dialNumber(l.phone) === number || dialNumber(l.direct) === number),
  );
  const derived = deriveLeadZone(null, number);
  const zone = active
    ? state.draft.zone
    : override ||
      matched?.zone ||
      (number?.startsWith("+1") && derived.source !== "unknown" ? derived.zone : "");
  const hours = callingHours(now, zone);
  const blocked = Boolean(number && suppressedNumber(state, number));
  const paused = state.sessions.some(
    (s) => s.id === state.activeSessionId && s.status === "paused",
  );
  async function act(action: Action) {
    if (busy || runtime.pending) return false;
    setBusy(true);
    setError("");
    try {
      const ok = await dispatch(action);
      if (!ok) setError("Could not complete this action. Review workspace status.");
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete this action.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function call() {
    if (!number || blocked || active || paused || busy) return;
    if (!zone) {
      setError("Choose the lead’s time zone before calling this number.");
      return;
    }
    if (runtime.mode === "live" && !runtime.voice?.ready) {
      setBusy(true);
      try {
        await runtime.voice?.connect();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect calling.");
      } finally {
        setBusy(false);
      }
      return;
    }
    guarded(() => {
      void act({
        type: "manualDial",
        id: crypto.randomUUID(),
        leadId: crypto.randomUUID(),
        phone: number,
        name: matched?.contact ?? "",
        at: new Date().toISOString(),
        zone,
        ...(runtime.mode === "live" ? { phase: "connecting" as const } : {}),
      }).then((ok) => {
        if (ok) setOwnCall(true);
      });
    });
  }
  if (!open) return null;
  if (minimized)
    return (
      <section className="mx-floating mx-floating-min" aria-label="Minimized dialpad">
        <button className="text-button" onClick={() => setMinimized(false)}>
          {active ? state.call?.phone : "Dialpad"}{" "}
          {active && formatDuration(state.call?.seconds ?? 0)}
        </button>
        {active ? (
          <button
            className="icon-button"
            aria-label="End call"
            disabled={busy}
            onClick={() => void act({ type: "end", at: new Date().toISOString() })}
          >
            <PhoneOff size={18} />
          </button>
        ) : (
          <button className="icon-button" aria-label="Close dialpad" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </section>
    );
  return (
    <section
      className="mx-floating"
      aria-label="Floating dialpad"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <strong>Dialpad</strong>
        <div>
          <button
            className="icon-button"
            aria-label="Minimize dialpad"
            onClick={() => setMinimized(true)}
          >
            <Minus size={18} />
          </button>
          <button className="icon-button" aria-label="Close dialpad" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      <label className="field">
        <span>Country code</span>
        <select
          value={country}
          disabled={active}
          onChange={(e) => {
            setCountry(e.target.value);
            setValue("");
            setOverride("");
          }}
        >
          <option value="1">US / Canada +1</option>
          <option value="91">India +91</option>
          <option value="44">United Kingdom +44</option>
        </select>
      </label>
      <label className="field">
        <span>Phone number</span>
        <input
          ref={input}
          type="tel"
          value={active ? state.call?.phone : value}
          readOnly={active}
          onChange={(e) => {
            setValue(e.target.value);
            setOverride("");
            setOwnCall(false);
          }}
        />
      </label>
      {!active && (
        <button
          className="text-button"
          aria-label="Delete last digit"
          onClick={() => {
            setValue((v) => v.slice(0, -1));
            setOverride("");
          }}
        >
          <Delete size={16} />
          Delete
        </button>
      )}
      {value && !number && !active && (
        <p className="error">Enter a valid 10-digit number for the selected country.</p>
      )}
      <p className="hint">
        {active
          ? `${state.call?.phase === "connecting" ? "Connecting" : "Connected"} · ${formatDuration(state.call?.seconds ?? 0)}`
          : matched
            ? `In your leads · ${matched.business}`
            : "New number · creates a manual-call lead when dialed"}
      </p>
      <p className="hint">
        IST {timeAt(now, "Asia/Kolkata")} ·{" "}
        {zone
          ? `${timeAt(now, zone)} local · ${hours ? "Open" : "Outside calling hours"}`
          : "Unknown time zone · calling hours unchecked"}
      </p>
      {!active && (
        <label className="field">
          <span>Lead time zone</span>
          <select value={zone} onChange={(e) => setOverride(e.target.value)}>
            <option value="">Unknown — choose a zone</option>
            {zones
              .filter((z) => z.value)
              .map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="keypad" role="group" aria-label="Floating keypad">
        {"123456789*0#".split("").map((d) => (
          <button
            key={d}
            aria-label={active ? `Send digit ${d}` : `Enter digit ${d}`}
            disabled={
              busy ||
              (active &&
                (state.call?.held || (runtime.mode === "live" && !runtime.capabilities.dtmf)))
            }
            onClick={() => {
              if (active) void act({ type: "digit", value: d });
              else if (/\d/.test(d)) setValue((v) => v + d);
            }}
          >
            {d}
          </button>
        ))}
      </div>
      {active && (
        <>
          <output>{state.call?.digits}</output>
          <button
            className="button"
            disabled={busy}
            aria-pressed={state.call?.muted}
            onClick={() => void act({ type: "mute" })}
          >
            {state.call?.muted ? "Unmute" : "Mute"}
          </button>
        </>
      )}
      <label className="field">
        <span>Microphone</span>
        <select
          value={state.preferences.microphone}
          onChange={(e) => void act({ type: "preferences", patch: { microphone: e.target.value } })}
        >
          <option value="default">System default</option>
          {runtime.voice?.inputDevices
            ?.filter((d) => d.id !== "default")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
        </select>
      </label>
      {blocked && <p className="error">This number is blocked by do-not-call protection.</p>}
      {paused && <p className="hint">Resume the calling session first.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className={`button phone-call-button ${active ? "danger" : "primary"}`}
        disabled={busy || runtime.pending || (!active && (!number || blocked || paused))}
        onClick={() =>
          active ? void act({ type: "end", at: new Date().toISOString() }) : void call()
        }
      >
        {active ? <PhoneOff size={20} /> : <Phone size={20} />}{" "}
        {active
          ? "End call"
          : runtime.mode === "live" && !runtime.voice?.ready
            ? "Connect calling"
            : "Call"}
      </button>
      {!active && ownCall && state.call && (
        <div>
          <p>Call outcome</p>
          <div className="mx-legend">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                aria-pressed={state.draft.outcome === o.value}
                onClick={() => void act({ type: "edit", patch: { outcome: o.value } })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            className="button primary"
            disabled={busy || !isDirty(state)}
            onClick={() => void act({ type: "save" })}
          >
            Save outcome
          </button>
        </div>
      )}
      {!active && (
        <div>
          <p className="eyebrow">Recent calls</p>
          {state.logs.slice(0, 3).map((log) => (
            <button
              key={log.id}
              className="text-button"
              onClick={() => {
                setValue(log.phone);
                setCountry(
                  log.phone.startsWith("+91") ? "91" : log.phone.startsWith("+44") ? "44" : "1",
                );
                setOverride("");
              }}
            >
              {log.phone}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
