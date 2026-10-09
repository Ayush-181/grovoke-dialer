import { dateAt, timeAt } from "./format";
import { useState, type Dispatch, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  History,
  MapPin,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  RotateCcw,
  Save,
  Search,
  Signal,
  Users,
  X,
} from "lucide-react";
import { type State, type Action, isDirty, zones } from "./model";
import { Panel, PanelHead, Field, Modal, Empty } from "./components";
import { OUTCOMES, outcomeLabel, formatDuration } from "../lib/outcomes";
import { bookingInstants } from "../lib/booking-time";

type Props = {
  state: State;
  dispatch: Dispatch<Action>;
  notify: (message: string) => void;
  openLead: (id: string) => void;
  guarded: (action: () => void) => void;
  now: Date;
};
export function Dialer({ state, dispatch, notify, openLead, guarded, now }: Props) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("notes");
  const [conference, setConference] = useState(false);
  const [participant, setParticipant] = useState("Demo teammate · Taylor");
  const [error, setError] = useState("");
  const lead = state.draft;
  const active = Boolean(state.call?.active);
  const queue = state.queueIds.map((id) => state.leads.find((l) => l.id === id)!).filter(Boolean);
  const position = state.queueIds.indexOf(state.selectedId);
  const visible = queue.filter((l) =>
    `${l.business} ${l.contact}`.toLowerCase().includes(search.toLowerCase()),
  );
  const history = state.logs.filter((l) => l.leadId === lead.id);
  const dirty = isDirty(state);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-next") === "true";
    if (active) return;
    if (next && !lead.outcome) {
      setError("Choose a call outcome before saving and moving to the next lead.");
      document.getElementById("outcome-heading")?.focus();
      return;
    }
    if (lead.callbackAt && lead.callback) {
      const dates = bookingInstants(lead.callbackAt, lead.zone);
      if (dates.length !== 1) {
        setError(
          dates.length
            ? "This callback time repeats during daylight saving. Choose an unambiguous time."
            : "This callback time does not exist in the lead’s timezone. Choose another time.",
        );
        document.getElementById("callback-time")?.focus();
        return;
      }
    }
    setError("");
    dispatch({ type: "save", next });
    notify(
      next
        ? "Saved. The next lead is ready — dial when you’re ready."
        : "Lead saved. You’re still on this lead.",
    );
  }
  return (
    <form className="dialer-form" onSubmit={save}>
      <div className="queue-toolbar">
        <div>
          <span className="badge">
            <ListIcon />
            Focused calling queue
          </span>
          <span>
            {position + 1} of {queue.length} leads
          </span>
        </div>
        <div>
          <label className="compact-select">
            <span className="sr-only">Choose calling queue</span>
            <select
              disabled={active}
              value=""
              onChange={(e) => {
                const mode = e.target.value;
                const ids = state.leads
                  .filter((l) =>
                    mode === "callbacks" ? l.callback : mode === "new" ? !l.outcome : true,
                  )
                  .map((l) => l.id);
                if (!ids.length) {
                  notify("No leads match this queue yet.");
                  return;
                }
                guarded(() => dispatch({ type: "queue", ids }));
              }}
            >
              <option value="">Change queue…</option>
              <option value="all">All leads</option>
              <option value="new">Never called</option>
              <option value="callbacks">Worth a callback</option>
            </select>
          </label>
          <div
            className="progress-track"
            aria-label={`Queue position ${position + 1} of ${queue.length}`}
          >
            <span style={{ width: `${((position + 1) / queue.length) * 100}%` }} />
          </div>
        </div>
      </div>
      {state.queueComplete && (
        <div className="success-banner" role="status">
          <Check aria-hidden="true" size={18} />
          Queue complete. Your final lead is saved. Choose another queue when you’re ready.
        </div>
      )}
      <div className="dialer-grid">
        <Panel className="queue-panel">
          <PanelHead
            title="Calling queue"
            subtitle={`${queue.length} businesses · manual dialing`}
          />
          <label className="search">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Search calling queue</span>
            <input
              name="queue-search"
              autoComplete="off"
              placeholder="Search leads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="queue-list">
            {visible.map((l) => (
              <button
                type="button"
                key={l.id}
                className={`queue-item ${l.id === lead.id ? "selected" : ""}`}
                onClick={() => openLead(l.id)}
                disabled={active && l.id !== lead.id}
                aria-current={l.id === lead.id ? "true" : undefined}
              >
                <span className="queue-number">{queue.indexOf(l) + 1}</span>
                <span>
                  <strong>{l.business}</strong>
                  <small>{l.contact || "Contact not added"}</small>
                  <span className="queue-meta">
                    {l.city}
                    <span className={`badge ${l.outcome ? "neutral" : "good"}`}>
                      {l.outcome ? outcomeLabel(l.outcome) : "New"}
                    </span>
                  </span>
                </span>
                {l.callback && <RotateCcw aria-label="Worth a callback" size={14} />}
              </button>
            ))}
            {!visible.length && (
              <Empty
                title="No matching leads"
                description="Try another business or contact name."
              />
            )}
          </div>
          <div className="queue-footer">
            <span className="status-dot" />
            Your pace. No automatic advancing.
          </div>
        </Panel>
        <Panel className="lead-panel">
          <div className="lead-identity">
            <div className="eyebrow">
              {lead.category} · {lead.city}
            </div>
            <h2>{lead.business}</h2>
            <div className="lead-badges">
              <span className={`badge ${lead.outcome === "do_not_call" ? "bad" : "good"}`}>
                {lead.outcome ? outcomeLabel(lead.outcome) : "Never called"}
              </span>
              <span className="badge neutral">
                {lead.calls} {lead.calls === 1 ? "dial" : "dials"}
              </span>
              {dirty && <span className="badge amber">Unsaved changes</span>}
            </div>
            <div className="lead-facts">
              <span>
                <Phone aria-hidden="true" size={16} />
                <span className="mono">{lead.phone}</span>
              </span>
              <span>
                <MapPin aria-hidden="true" size={16} />
                {lead.city}
              </span>
            </div>
            <div className="dual-time">
              <div>
                <small>LEAD’S LOCAL TIME</small>
                <strong>{timeAt(now, lead.zone)}</strong>
              </div>
              <div>
                <small>YOUR TIME · INDIA</small>
                <strong>{timeAt(now, "Asia/Kolkata")}</strong>
              </div>
            </div>
          </div>
          <div className="ask-for">
            <div className="section-label">
              <Users aria-hidden="true" size={15} />
              ASK FOR<span>Editable contact details</span>
            </div>
            <div className="field-grid">
              <Field
                label="Name"
                value={lead.contact}
                placeholder="Contact name…"
                onChange={(e) => dispatch({ type: "edit", patch: { contact: e.target.value } })}
              />
              <Field
                label="Role"
                value={lead.role}
                placeholder="Owner, front desk…"
                onChange={(e) => dispatch({ type: "edit", patch: { role: e.target.value } })}
              />
              <Field
                label="Direct number"
                type="tel"
                value={lead.direct}
                placeholder="+1 212 555 0100…"
                onChange={(e) => dispatch({ type: "edit", patch: { direct: e.target.value } })}
              />
              <Field
                label="Email"
                type="email"
                spellCheck={false}
                value={lead.email}
                placeholder="name@example.invalid…"
                onChange={(e) => dispatch({ type: "edit", patch: { email: e.target.value } })}
              />
            </div>
          </div>
          <div className="lead-extra field-grid">
            <Field
              label="Business name"
              value={lead.business}
              required
              onChange={(e) => dispatch({ type: "edit", patch: { business: e.target.value } })}
            />
            <label className="field">
              <span>Lead timezone</span>
              <select
                name="lead-timezone"
                value={lead.zone}
                onChange={(e) => dispatch({ type: "edit", patch: { zone: e.target.value } })}
              >
                {zones.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="tab-list"
            role="tablist"
            aria-label="Lead context"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "notes"
                  : event.key === "End"
                    ? "history"
                    : tab === "notes"
                      ? "history"
                      : "notes";
              setTab(next);
              document.getElementById(`${next}-tab`)?.focus();
            }}
          >
            <button
              type="button"
              role="tab"
              id="notes-tab"
              tabIndex={tab === "notes" ? 0 : -1}
              aria-selected={tab === "notes"}
              aria-controls="notes-panel"
              onClick={() => setTab("notes")}
            >
              <FileText aria-hidden="true" size={15} />
              Notes
            </button>
            <button
              type="button"
              role="tab"
              id="history-tab"
              tabIndex={tab === "history" ? 0 : -1}
              aria-selected={tab === "history"}
              aria-controls="history-panel"
              onClick={() => setTab("history")}
            >
              <History aria-hidden="true" size={15} />
              Past calls <span>{history.length}</span>
            </button>
          </div>
          {tab === "notes" ? (
            <div
              className="lead-notes"
              role="tabpanel"
              id="notes-panel"
              aria-labelledby="notes-tab"
            >
              <label className="field">
                <span>Context & conversation notes</span>
                <textarea
                  name="lead-notes"
                  placeholder="What did they say? Who should you ask for next time?…"
                  value={lead.notes}
                  onChange={(e) => dispatch({ type: "edit", patch: { notes: e.target.value } })}
                />
              </label>
              <p className="hint">Your notes stay here until you explicitly save.</p>
            </div>
          ) : (
            <div
              className="lead-history"
              role="tabpanel"
              id="history-panel"
              aria-labelledby="history-tab"
            >
              {history.length ? (
                history.map((log) => (
                  <div className="history-item" key={log.id}>
                    <span className="history-dot" />
                    <div>
                      <strong>
                        {outcomeLabel(log.outcome) === "—"
                          ? "Awaiting outcome"
                          : outcomeLabel(log.outcome)}
                      </strong>
                      <small>
                        {dateAt(log.at, lead.zone)} · {formatDuration(log.seconds)}
                      </small>
                      <p>{log.notes || "No notes recorded."}</p>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="A fresh conversation"
                  description="This lead has no recorded calls yet."
                />
              )}
            </div>
          )}
        </Panel>
        <Panel className="outcome-panel">
          <div className="call-controls">
            <div className="call-status">
              <span className={active ? "status-dot" : "idle-dot"} />
              {active
                ? "Simulated call connected"
                : state.call
                  ? "Call ended · choose outcome"
                  : "Ready when you are"}
              <Signal aria-hidden="true" size={15} />
            </div>
            <div className="call-timer mono">{formatDuration(state.call?.seconds ?? 0)}</div>
            <div className="recording-status">
              <span className={state.call?.recording ? "recording-dot" : "idle-dot"} />
              {active
                ? state.call?.recording
                  ? "Recording this call (demo)"
                  : "This call is not recording"
                : `Auto recording ${state.recordingEnabled ? "on" : "off"}`}
            </div>
            <label className="mic-select">
              <Mic aria-hidden="true" size={15} />
              <span className="sr-only">Microphone</span>
              <select
                name="microphone"
                value={state.preferences.microphone}
                onChange={(e) =>
                  dispatch({ type: "preferences", patch: { microphone: e.target.value } })
                }
              >
                <option value="default">Default microphone (simulated)</option>
                <option value="headset">USB headset (simulated)</option>
              </select>
            </label>
            {active ? (
              <>
                <div className="call-actions">
                  <button
                    type="button"
                    className={`button ${state.call?.muted ? "selected" : ""}`}
                    aria-pressed={state.call?.muted}
                    onClick={() => dispatch({ type: "mute" })}
                  >
                    {state.call?.muted ? (
                      <MicOff aria-hidden="true" size={16} />
                    ) : (
                      <Mic aria-hidden="true" size={16} />
                    )}
                    {state.call?.muted ? "Unmute" : "Mute"}
                  </button>
                  <button type="button" className="button" onClick={() => setConference(true)}>
                    <Users aria-hidden="true" size={16} />
                    Add participant
                  </button>
                </div>
                <div className="keypad" aria-label="Call keypad">
                  {"123456789*0#".split("").map((digit) => (
                    <button
                      type="button"
                      key={digit}
                      aria-label={`Send digit ${digit}`}
                      onClick={() => dispatch({ type: "digit", value: digit })}
                    >
                      {digit}
                    </button>
                  ))}
                </div>
                {state.call?.digits && (
                  <div className="digits mono" aria-live="polite">
                    {state.call.digits}
                  </div>
                )}
                {state.call?.participants.map((name) => (
                  <div className="participant" key={name}>
                    <span className="status-dot" />
                    <span>{name}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${name}`}
                      onClick={() => dispatch({ type: "participant", name, remove: true })}
                    >
                      <X aria-hidden="true" size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button danger full"
                  onClick={() => {
                    dispatch({ type: "end", at: new Date().toISOString() });
                    notify("Call ended. Add your outcome and save when ready.");
                  }}
                >
                  <PhoneOff aria-hidden="true" size={17} />
                  {state.call?.participants.length ? "End conference" : "End call"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button primary full dial-button"
                disabled={
                  lead.outcome === "do_not_call" ||
                  state.leads.find((l) => l.id === lead.id)?.outcome === "do_not_call"
                }
                onClick={() => {
                  setError("");
                  dispatch({ type: "dial", id: crypto.randomUUID() });
                }}
              >
                <Phone aria-hidden="true" size={17} />
                {lead.outcome === "do_not_call" ? "Do not call" : "Dial · simulated"}
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            )}
          </div>
          <div className="outcomes">
            <h2 id="outcome-heading" tabIndex={-1}>
              Call outcome
            </h2>
            <p>Select an outcome. You stay on this lead.</p>
            <div className="outcome-grid">
              {OUTCOMES.filter((o) => o.value !== "dialed").map((o) => (
                <button
                  type="button"
                  key={o.value}
                  className={`outcome-option ${lead.outcome === o.value ? "selected" : ""}`}
                  aria-pressed={lead.outcome === o.value}
                  onClick={() => dispatch({ type: "edit", patch: { outcome: o.value } })}
                >
                  <span className={`outcome-dot tone-${o.tone}`} />
                  {o.label.replace("Connected - ", "Reached ")}
                  {lead.outcome === o.value && <Check aria-hidden="true" size={13} />}
                </button>
              ))}
            </div>
            <div className="call-flags">
              <label>
                <input
                  type="checkbox"
                  name="triage"
                  checked={lead.triage}
                  onChange={(e) => dispatch({ type: "edit", patch: { triage: e.target.checked } })}
                />
                Triage held
              </label>
              <label>
                <input
                  type="checkbox"
                  name="offered"
                  checked={lead.offered}
                  onChange={(e) => dispatch({ type: "edit", patch: { offered: e.target.checked } })}
                />
                Appointment offered
              </label>
            </div>
          </div>
          <div className={`callback-card ${lead.callback ? "enabled" : ""}`}>
            <button
              type="button"
              className="callback-toggle"
              aria-pressed={lead.callback}
              onClick={() => dispatch({ type: "edit", patch: { callback: !lead.callback } })}
            >
              <RotateCcw aria-hidden="true" size={17} />
              <span>
                <strong>Worth a callback</strong>
                <small>Keep this lead on your follow-up list</small>
              </span>
              <span className={`switch ${lead.callback ? "on" : ""}`}>
                <span />
              </span>
            </button>
            {lead.callback && (
              <div className="callback-fields">
                <Field
                  id="callback-time"
                  label="When to try again (optional)"
                  type="datetime-local"
                  value={lead.callbackAt}
                  onChange={(e) =>
                    dispatch({ type: "edit", patch: { callbackAt: e.target.value } })
                  }
                />
                <p className="hint">
                  In the lead’s timezone · {zones.find((z) => z.value === lead.zone)?.label}
                </p>
                <Field
                  label="Reason (optional)"
                  value={lead.callbackReason}
                  placeholder="Owner returns after lunch…"
                  onChange={(e) =>
                    dispatch({ type: "edit", patch: { callbackReason: e.target.value } })
                  }
                />
              </div>
            )}
          </div>
        </Panel>
      </div>
      <div className="save-bar">
        <div>
          <button
            type="button"
            className="button"
            disabled={position <= 0 || active}
            onClick={() => openLead(state.queueIds[position - 1]!)}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            Previous
          </button>
          <span className="save-status">
            {active
              ? "End the call before moving to another lead."
              : dirty
                ? "Unsaved changes · nothing advances automatically"
                : "All changes saved in this preview"}
          </span>
        </div>
        <div>
          <button type="submit" className="button" disabled={active}>
            <Save aria-hidden="true" size={16} />
            Save
          </button>
          <button type="submit" data-next="true" className="button primary" disabled={active}>
            Save & next
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <Modal
        open={conference}
        onClose={() => setConference(false)}
        title="Add a participant"
        description="Preview the conference flow with a simulated teammate. No number is dialed."
      >
        <label className="field">
          <span>Participant</span>
          <select
            name="conference-participant"
            value={participant}
            onChange={(e) => setParticipant(e.target.value)}
          >
            <option>Demo teammate · Taylor</option>
            <option>Demo teammate · Riley</option>
          </select>
        </label>
        <p className="hint">
          The lead stays in the call. Removing a teammate keeps your call with the lead active.
        </p>
        <div className="modal-actions">
          <button type="button" className="button" onClick={() => setConference(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              dispatch({ type: "participant", name: participant });
              setConference(false);
              notify("Simulated teammate joined the conference.");
            }}
          >
            <Plus aria-hidden="true" size={16} />
            Add to conference
          </button>
        </div>
      </Modal>
    </form>
  );
}
function ListIcon() {
  return <Phone aria-hidden="true" size={12} />;
}
