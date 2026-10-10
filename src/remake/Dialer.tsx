import { dateAt } from "./format";
import { useState, type Dispatch, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  History,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  RotateCcw,
  Save,
  Search,
  Users,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
  Pause,
  Play,
} from "lucide-react";
import { type State, type Action, isDirty } from "./model";
import { Panel, Field, Modal, Empty } from "./components";
import { OUTCOMES, outcomeLabel, formatDuration } from "../lib/outcomes";
import { bookingInstants } from "../lib/booking-time";
import { dialNumber } from "./numbers";
import { sessionElapsed, sessionTime } from "./metrics";

type Props = {
  state: State;
  dispatch: Dispatch<Action>;
  notify: (message: string) => void;
  openLead: (id: string) => void;
  guarded: (action: () => void) => void;
  now: Date;
};
export function Dialer({ state, dispatch, openLead, guarded, now }: Props) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("notes");
  const [conference, setConference] = useState(false);
  const [participantPhone, setParticipantPhone] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantError, setParticipantError] = useState("");
  const [manual, setManual] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualError, setManualError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(() => innerWidth >= 1100);
  const lead = state.draft;
  const active = Boolean(state.call?.active);
  const session = state.sessions.find((s) => s.id === state.activeSessionId);
  const attempt = state.logs.find((log) => log.id === state.call?.id && log.leadId === lead.id);
  const queue = state.queueIds.map((id) => state.leads.find((l) => l.id === id)!).filter(Boolean);
  const position = state.queueIds.indexOf(state.selectedId);
  const visible = queue.filter((l) =>
    `${l.business} ${l.contact}`.toLowerCase().includes(search.toLowerCase()),
  );
  const history = state.logs.filter((l) => l.leadId === lead.id);
  const dirty = isDirty(state);
  function endCall() {
    dispatch({ type: "end", at: now.toISOString() });
    setStatus("Call ended. Choose your outcome, then save.");
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-next") === "true";
    if (active) return;
    if (next && !lead.outcome) {
      setError("Choose a call outcome before moving to the next lead.");
      document.getElementById("outcome-heading")?.focus();
      return;
    }
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      setContactOpen(true);
      setError("Enter a valid contact email or clear the field.");
      return;
    }
    if (
      lead.callbackAt &&
      lead.callback &&
      bookingInstants(lead.callbackAt, lead.zone).length !== 1
    ) {
      setError("Choose an unambiguous callback time in the lead’s timezone.");
      document.getElementById("callback-time")?.focus();
      return;
    }
    setError("");
    dispatch({ type: "save", next });
    setStatus(
      next ? "Saved. Next lead ready — no automatic dialing." : "Saved. You’re still on this lead.",
    );
  }
  return (
    <form
      className={`dialer-form ${queueOpen ? "queue-expanded" : "queue-collapsed"}`}
      onSubmit={save}
    >
      <div className="dialer-toolbar">
        <div>
          <button
            type="button"
            className="button"
            aria-expanded={queueOpen}
            aria-controls="calling-queue"
            onClick={() => setQueueOpen((v) => !v)}
          >
            {queueOpen ? (
              <PanelLeftClose aria-hidden="true" size={18} />
            ) : (
              <PanelLeftOpen aria-hidden="true" size={18} />
            )}
            {queueOpen ? "Hide lead list" : "Show lead list"}
          </button>
          <span>
            {position + 1} / {queue.length} leads
          </span>
          <button
            type="button"
            className="button"
            disabled={active || session?.status === "paused"}
            onClick={() => {
              setManualError("");
              setManual(true);
            }}
          >
            <Phone aria-hidden="true" size={17} />
            Dial a number
          </button>
        </div>
        <div>
          {session && (
            <>
              <strong className="session-clock mono" aria-label="Session elapsed time">
                {sessionTime(sessionElapsed(session, now.getTime()))}
              </strong>
              <span className="session-state">Session {session.status}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={session.status === "running" ? "Pause session" : "Resume session"}
                disabled={active}
                onClick={() =>
                  dispatch(
                    session.status === "running"
                      ? {
                          type: "setSessionStatus",
                          id: session.id,
                          status: "paused",
                          now: now.getTime(),
                        }
                      : { type: "startSession", id: session.id, now: now.getTime() },
                  )
                }
              >
                {session.status === "running" ? (
                  <Pause aria-hidden="true" size={17} />
                ) : (
                  <Play aria-hidden="true" size={17} />
                )}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  if (active) endCall();
                  dispatch({
                    type: "setSessionStatus",
                    id: session.id,
                    status: "stopped",
                    now: now.getTime(),
                  });
                }}
              >
                <Square aria-hidden="true" size={15} />
                Stop session
              </button>
            </>
          )}
          <label>
            <span className="sr-only">Choose calling queue</span>
            <select
              disabled={active || Boolean(session)}
              value=""
              onChange={(e) => {
                const mode = e.target.value;
                const ids = state.leads
                  .filter((l) =>
                    mode === "callbacks" ? l.callback : mode === "new" ? !l.outcome : true,
                  )
                  .map((l) => l.id);
                if (!ids.length) {
                  setStatus("No leads match this queue yet.");
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
        </div>
      </div>
      <div className="dialer-grid">
        {queueOpen && (
          <Panel className="queue-panel">
            <div className="queue-heading">
              <h2>Calling queue</h2>
              <span>{queue.length} leads</span>
            </div>
            <label className="search">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">Search calling queue</span>
              <input
                name="queue-search"
                autoComplete="off"
                placeholder="Search leads…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="queue-list" id="calling-queue">
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
                  {l.callback && <RotateCcw aria-label="Worth a callback" size={15} />}
                </button>
              ))}
              {!visible.length && (
                <Empty
                  title="No matching leads"
                  description="Try another business or contact name."
                />
              )}
            </div>
          </Panel>
        )}
        <Panel className="lead-panel">
          <div className="lead-identity">
            <span className="eyebrow">
              {lead.category} · {lead.city}
            </span>
            <h2>{lead.business}</h2>
            <div className="lead-facts">
              <span className="mono">
                {state.call?.leadId === lead.id ? state.call.phone : lead.phone}
              </span>
              <span className="badge neutral">{lead.calls} dials</span>
              <span className={`badge ${lead.outcome === "do_not_call" ? "bad" : "good"}`}>
                {lead.outcome ? outcomeLabel(lead.outcome) : "Never called"}
              </span>
            </div>
          </div>
          <div className="ask-for">
            <button
              type="button"
              className="ask-toggle"
              aria-expanded={contactOpen}
              aria-controls="contact-details"
              onClick={() => setContactOpen((value) => !value)}
            >
              <Users aria-hidden="true" size={17} />
              <strong>ASK FOR</strong>
              <span>{contactOpen ? "Less" : "Contact details"}</span>
              <ChevronDown aria-hidden="true" size={16} />
            </button>
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
            </div>
            {contactOpen && (
              <div className="field-grid contact-details" id="contact-details">
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
            )}
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
            {["notes", "history"].map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`${value}-tab`}
                tabIndex={tab === value ? 0 : -1}
                aria-selected={tab === value}
                aria-controls={`${value}-panel`}
                onClick={() => setTab(value)}
              >
                {value === "notes" ? (
                  <FileText aria-hidden="true" size={16} />
                ) : (
                  <History aria-hidden="true" size={16} />
                )}
                {value === "notes" ? "Notes" : `Past calls (${history.length})`}
              </button>
            ))}
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
                  placeholder="What did they say? Who should you ask for?…"
                  value={lead.notes}
                  onChange={(e) => dispatch({ type: "edit", patch: { notes: e.target.value } })}
                />
              </label>
            </div>
          ) : (
            <div
              className="lead-history"
              role="tabpanel"
              id="history-panel"
              aria-labelledby="history-tab"
            >
              {history.length ? (
                <>
                  <div className="history-item">
                    <div>
                      <strong>{outcomeLabel(history[0]!.outcome)}</strong>
                      <small>
                        {dateAt(history[0]!.at)} · {formatDuration(history[0]!.seconds)}
                      </small>
                      <p>{history[0]!.notes || "No notes recorded."}</p>
                    </div>
                  </div>
                  <p className="hint">Full history is available in Activity / Call log.</p>
                </>
              ) : (
                <Empty
                  title="No previous calls"
                  description="This lead has no recorded calls yet."
                />
              )}
            </div>
          )}
          <div className="call-controls">
            <div className="caller-row">
              <div>
                <strong className="call-timer mono">
                  {formatDuration(state.call?.seconds ?? 0)}
                </strong>
                <div className="call-indicators">
                  <span className="call-status">
                    {active
                      ? "Simulated call connected"
                      : state.call
                        ? "Call ended"
                        : "Ready to dial"}
                  </span>
                  <span className="recording-status">
                    {active
                      ? state.call?.recording
                        ? "Recording this call (demo)"
                        : "Recording off"
                      : `Auto recording ${state.recordingEnabled ? "on" : "off"}`}
                  </span>
                </div>
              </div>{" "}
              <label className="mic-select">
                <Mic aria-hidden="true" size={16} />
                <span className="sr-only">Microphone</span>
                <select
                  name="microphone"
                  value={state.preferences.microphone}
                  onChange={(e) =>
                    dispatch({ type: "preferences", patch: { microphone: e.target.value } })
                  }
                >
                  <option value="default">Default mic · demo</option>
                  <option value="headset">USB headset · demo</option>
                </select>
              </label>
            </div>
            <div className="call-actions">
              {active ? (
                <>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={state.call?.muted ? "Unmute" : "Mute"}
                    aria-pressed={state.call?.muted}
                    onClick={() => dispatch({ type: "mute" })}
                  >
                    {state.call?.muted ? (
                      <MicOff aria-hidden="true" size={18} />
                    ) : (
                      <Mic aria-hidden="true" size={18} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setParticipantError("");
                      setConference(true);
                    }}
                  >
                    <Users aria-hidden="true" size={17} />
                    Add participant
                  </button>
                  <button type="button" className="button danger" onClick={endCall}>
                    <PhoneOff aria-hidden="true" size={17} />
                    {state.call?.participants.length ? "End conference" : "End call"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button primary dial-button"
                  disabled={
                    lead.outcome === "do_not_call" ||
                    state.leads.find((l) => l.id === lead.id)?.outcome === "do_not_call" ||
                    session?.status === "paused"
                  }
                  onClick={() => {
                    setError("");
                    setStatus("");
                    dispatch({ type: "dial", id: crypto.randomUUID(), at: now.toISOString() });
                  }}
                >
                  <Phone aria-hidden="true" size={17} />
                  {lead.outcome === "do_not_call" ? "Do not call" : "Dial · simulated"}
                </button>
              )}
            </div>
            {active && (
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
                <output className="digits mono">{state.call?.digits}</output>
              </div>
            )}
            {active && Boolean(state.call?.participants.length) && (
              <div className="conference-participants" aria-label="Additional participants">
                {state.call?.participants.map((person) => (
                  <div className="participant" key={person.phone}>
                    <span>
                      <strong>{person.name}</strong> <span className="mono">{person.phone}</span>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${person.name}`}
                      onClick={() =>
                        dispatch({ type: "participant", phone: person.phone, remove: true })
                      }
                    >
                      <X aria-hidden="true" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="lead-save-controls">
            <div className="inline-status" aria-live="polite">
              {error ? (
                <span className="error" role="alert">
                  {error}
                </span>
              ) : state.queueComplete ? (
                "Queue complete. Your final lead is saved."
              ) : dirty ? (
                "Unsaved changes"
              ) : (
                status || "Changes saved"
              )}
            </div>
            <div className="lead-save-actions">
              <button
                type="button"
                className="button"
                disabled={position <= 0 || active}
                onClick={() => openLead(state.queueIds[position - 1]!)}
              >
                <ArrowLeft aria-hidden="true" size={17} />
                Previous
              </button>
              <button type="submit" className="button" disabled={active}>
                <Save aria-hidden="true" size={17} />
                Save
              </button>
              <button type="submit" data-next="true" className="button primary" disabled={active}>
                Save & next
                <ArrowRight aria-hidden="true" size={17} />
              </button>
            </div>
          </div>
        </Panel>
        <Panel className="outcome-panel">
          <div className="outcomes">
            <h2 id="outcome-heading" tabIndex={-1}>
              Call outcome
            </h2>
            <p>Select, then Save or Save & next.</p>
            <div className="outcome-grid">
              {OUTCOMES.filter((o) => o.value !== "dialed" && o.value !== "appointment_set").map(
                (o) => (
                  <button
                    type="button"
                    key={o.value}
                    className={`outcome-option ${lead.outcome === o.value ? "selected" : ""}`}
                    aria-pressed={lead.outcome === o.value}
                    onClick={() => dispatch({ type: "edit", patch: { outcome: o.value } })}
                  >
                    <span className={`outcome-dot tone-${o.tone}`} />
                    {o.label.replace("Connected - ", "Reached ")}
                    {lead.outcome === o.value && <Check aria-hidden="true" size={15} />}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="milestones">
            <h3>Conversation milestones</h3>
            <div>
              {(
                [
                  ["triage", "Triage held"],
                  ["offered", "Appointment offered"],
                  ["booked", "Appointment booked"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  type="button"
                  key={kind}
                  aria-label={label}
                  className={`button milestone ${attempt?.[kind] || (kind === "booked" && attempt?.outcome === "appointment_set") ? "selected" : ""}`}
                  disabled={!attempt}
                  aria-pressed={Boolean(
                    attempt?.[kind] ||
                    (kind === "booked" && attempt?.outcome === "appointment_set"),
                  )}
                  onClick={() =>
                    dispatch({
                      type: "milestone",
                      kind,
                      enabled: !(
                        attempt?.[kind] ||
                        (kind === "booked" && attempt?.outcome === "appointment_set")
                      ),
                    })
                  }
                >
                  <Check aria-hidden="true" size={16} />
                  {kind === "offered" ? "Appt. offered" : label}
                </button>
              ))}
            </div>
            <p>Updates metrics immediately. Each call counts once in Connected.</p>
          </div>
          <div className={`callback-card ${lead.callback ? "enabled" : ""}`}>
            <button
              type="button"
              className="callback-toggle"
              aria-pressed={lead.callback}
              onClick={() => dispatch({ type: "edit", patch: { callback: !lead.callback } })}
            >
              <RotateCcw aria-hidden="true" size={18} />
              <span>
                <strong>Worth a callback</strong>
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
                <Field
                  label="Reason (optional)"
                  value={lead.callbackReason}
                  placeholder="Owner returns after lunch…"
                  onChange={(e) =>
                    dispatch({ type: "edit", patch: { callbackReason: e.target.value } })
                  }
                />
                <p className="hint">Callback time uses the lead’s timezone.</p>
              </div>
            )}
          </div>
        </Panel>
      </div>
      <Modal
        open={manual}
        onClose={() => setManual(false)}
        title="Dial a number"
        description="Enter a number directly. Saved numbers use their lead; a new number gets a local contact for its notes and outcome."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const phone = dialNumber(manualPhone);
            if (!phone) {
              setManualError(
                "Enter a valid phone number, including +country code for international numbers.",
              );
              document.getElementById("manual-phone")?.focus();
              return;
            }
            const blocked = state.leads.some(
              (item) =>
                item.outcome === "do_not_call" &&
                (dialNumber(item.phone) === phone || dialNumber(item.direct) === phone),
            );
            if (blocked) {
              setManualError("This number belongs to a do-not-call lead. Choose another number.");
              return;
            }
            setManual(false);
            guarded(() => {
              dispatch({
                type: "manualDial",
                id: crypto.randomUUID(),
                leadId: crypto.randomUUID(),
                phone,
                name: manualName,
                at: new Date().toISOString(),
              });
              setTab("notes");
              setError("");
              setStatus("");
            });
          }}
        >
          <Field
            id="manual-phone"
            label="Manual phone number"
            type="tel"
            required
            value={manualPhone}
            placeholder="+1 212 555 0199…"
            onChange={(e) => {
              setManualPhone(e.target.value);
              setManualError("");
            }}
          />
          <Field
            label="Contact or business (optional)"
            value={manualName}
            placeholder="Business or contact name…"
            onChange={(e) => setManualName(e.target.value)}
          />
          <p className="hint">
            10-digit US numbers use +1. Use +country code for other countries. This preview
            simulates dialing.
          </p>
          {manualError && (
            <p className="error" role="alert">
              {manualError}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setManual(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={active || session?.status === "paused"}
            >
              <Phone aria-hidden="true" size={16} />
              Dial number · simulated
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={conference}
        onClose={() => setConference(false)}
        title="Add a participant"
        description="Dial another decision maker or contact into this business call. The original caller stays connected."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const phone = dialNumber(participantPhone);
            if (!phone) {
              setParticipantError(
                "Enter a valid participant number, including +country code for international numbers.",
              );
              document.getElementById("participant-phone")?.focus();
              return;
            }
            if (
              phone === state.call?.phone ||
              state.call?.participants.some((person) => person.phone === phone)
            ) {
              setParticipantError("This number is already in the call. Enter another number.");
              document.getElementById("participant-phone")?.focus();
              return;
            }
            const match = state.leads.find(
              (item) => dialNumber(item.phone) === phone || dialNumber(item.direct) === phone,
            );
            if (
              state.leads.some(
                (item) =>
                  item.outcome === "do_not_call" &&
                  (dialNumber(item.phone) === phone || dialNumber(item.direct) === phone),
              )
            ) {
              setParticipantError(
                "This number belongs to a do-not-call lead. Choose another number.",
              );
              return;
            }
            dispatch({
              type: "participant",
              phone,
              name: participantName.trim() || match?.contact || phone,
            });
            setConference(false);
            setParticipantName("");
            setParticipantPhone("");
            setStatus("Participant connected to the simulated group call.");
          }}
        >
          <Field
            id="participant-phone"
            label="Participant phone number"
            type="tel"
            required
            value={participantPhone}
            placeholder="+1 212 555 0198…"
            onChange={(e) => {
              setParticipantPhone(e.target.value);
              setParticipantError("");
            }}
          />
          <Field
            label="Participant name (optional)"
            value={participantName}
            placeholder="Owner, co-founder, decision maker…"
            onChange={(e) => setParticipantName(e.target.value)}
          />
          <p className="hint">
            Add multiple contacts by repeating Add participant. Dialing and joining are simulated
            here.
          </p>
          {participantError && (
            <p className="error" role="alert">
              {participantError}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setConference(false)}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={!active}>
              <Plus aria-hidden="true" size={16} />
              Dial & add to call · simulated
            </button>
          </div>
        </form>
      </Modal>
    </form>
  );
}
