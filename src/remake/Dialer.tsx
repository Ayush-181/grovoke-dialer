import { dateAt, timeAt } from "./format";
import { useEffect, useState, type Dispatch, type FormEvent } from "react";
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
  CalendarDays,
  Keyboard,
  Copy,
  BookOpen,
  Pencil,
  Delete,
} from "lucide-react";
import { type State, type Action, isDirty } from "./model";
import { Panel, Field, Modal, Empty } from "./components";
import { OUTCOMES, outcomeLabel, formatDuration } from "../lib/outcomes";
import { bookingInstants } from "../lib/booking-time";
import { dialNumber } from "./numbers";
import { dateKey, inPeriod, metrics, sessionElapsed, sessionTime } from "./metrics";

import { BookingDialog } from "./Bookings";
import { shortcutCommand } from "./shortcuts";

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
  const [queueView, setQueueView] = useState("all");
  const [booking, setBooking] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [guideVisible, setGuideVisible] = useState(true);
  const [guideEditing, setGuideEditing] = useState(false);
  const [numberChoice, setNumberChoice] = useState<{ leadId: string; direct: boolean }>({
    leadId: "",
    direct: false,
  });
  const [tab, setTab] = useState("notes");
  const [conference, setConference] = useState(false);
  const [participantPhone, setParticipantPhone] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantError, setParticipantError] = useState("");
  const [manual, setManual] = useState(false);
  const [inlineManual, setInlineManual] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualError, setManualError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(() => innerWidth >= 1100);
  const lead = state.draft;
  const active = Boolean(state.call?.active);
  const session = state.sessions.find((s) => s.id === state.activeSessionId);
  const attempt = state.logs.find((log) => log.id === state.call?.id && log.leadId === lead.id);
  const queue = state.queueIds.map((id) => state.leads.find((l) => l.id === id)!).filter(Boolean);
  const position = state.queueIds.indexOf(state.selectedId);
  const visible = queue.filter(
    (l) =>
      (queueView === "callbacks" ? l.callback : queueView === "new" ? !l.outcome : true) &&
      `${l.business} ${l.contact} ${l.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  const history = state.logs.filter((l) => l.leadId === lead.id);
  const dirty = isDirty(state);
  const totals = metrics(
    session
      ? state.logs.filter((log) => log.sessionId === session.id)
      : inPeriod(state.logs, dateKey(now)),
  );
  const chosenPhone =
    numberChoice.leadId === lead.id && numberChoice.direct ? lead.direct : lead.phone;
  const guide =
    lead.talkingPoints ??
    `OPEN\nHi, is ${lead.contact || "the person who handles enquiries"} available? I’m Ash, calling about ${lead.business}.\n\nDISCOVER\nHow do you manage enquiries? Where does follow-up get missed?\n\nNEXT STEP\nAgree the next step: book together, or flag a callback with a reason.`;
  const paused = session?.status === "paused";
  const blocked =
    lead.outcome === "do_not_call" ||
    state.leads.find((item) => item.id === lead.id)?.outcome === "do_not_call";
  function startDial(phone = chosenPhone) {
    if (!dialNumber(phone)) {
      setError("Enter a valid number with +country code, or choose the main number.");
      return;
    }
    if (active || paused || blocked) return;
    setError("");
    setStatus("");
    dispatch({ type: "dial", id: crypto.randomUUID(), phone, at: new Date().toISOString() });
  }
  function dialManualNumber(phoneValue: string, name = "") {
    const phone = dialNumber(phoneValue);
    if (!phone) {
      setManualError("Enter a valid number, with +country code.");
      return;
    }
    if (active || paused) return;
    if (
      state.leads.some(
        (item) =>
          item.outcome === "do_not_call" &&
          (dialNumber(item.phone) === phone || dialNumber(item.direct) === phone),
      )
    ) {
      setManualError("That is a do-not-call number.");
      return;
    }
    setManual(false);
    guarded(() => {
      dispatch({
        type: "manualDial",
        id: crypto.randomUUID(),
        leadId: crypto.randomUUID(),
        phone,
        name,
        at: new Date().toISOString(),
      });
      setInlineManual(false);
      setTab("notes");
      setManualError("");
      setError("");
      setStatus("");
    });
  }
  function startSession() {
    guarded(() => {
      const id = crypto.randomUUID();
      dispatch({
        type: "session",
        session: {
          id,
          name: `Calling session · ${timeAt(now, "Asia/Kolkata")}`,
          leadIds: [lead.id, ...state.queueIds.filter((item) => item !== lead.id)],
          paused: false,
          status: "ready",
          elapsedMs: 0,
          startedAt: null,
        },
      });
      dispatch({ type: "startSession", id, now: Date.now() });
    });
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const editing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const command = shortcutCommand(
        event,
        editing,
        Boolean(document.querySelector('[role="dialog"]')),
      );
      if (!command) return;
      event.preventDefault();
      if (command === "notes") document.getElementById("call-notes")?.focus();
      else {
        const button = document.getElementById(`dialer-${command}`) as HTMLButtonElement | null;
        if (button && !button.disabled) button.click();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
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
      noValidate
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
        <div
          className="dialer-live-metrics"
          aria-label={session ? "Session call metrics" : "Today’s call metrics"}
        >
          <span>
            <strong>{totals.dials}</strong> Dials
          </span>
          <span>
            <strong>{totals.connected}</strong> Connected
          </span>
          <span>
            <strong>{totals.booked}</strong> Booked
          </span>
        </div>
        <div>
          {!session && (
            <button type="button" className="button" disabled={active} onClick={startSession}>
              <Play aria-hidden="true" size={15} /> Start session
            </button>
          )}
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
        </div>
      </div>
      <div className="dialer-grid">
        {queueOpen && (
          <Panel className="queue-panel">
            <div className="queue-heading">
              <h2>Calling queue</h2>
              <span>{queue.length}</span>
              <label className="queue-select">
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
                    guarded(() => {
                      dispatch({ type: "queue", ids });
                      setQueueView("all");
                      setSearch("");
                    });
                  }}
                >
                  <option value="">Queue…</option>
                  <option value="all">All leads</option>
                  <option value="new">Never called</option>
                  <option value="callbacks">Worth a callback</option>
                </select>
              </label>
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
            <div className="queue-views" aria-label="Queue views">
              {[
                ["all", "All"],
                ["new", "New"],
                ["callbacks", "Callbacks"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={queueView === value ? "active" : ""}
                  aria-pressed={queueView === value}
                  onClick={() => setQueueView(value!)}
                >
                  {label}
                </button>
              ))}
            </div>
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
              <span className="mono">{active ? state.call!.phone : chosenPhone}</span>
              <span className="badge neutral">{lead.calls} dials</span>
              <span className={`badge ${lead.outcome === "do_not_call" ? "bad" : "good"}`}>
                {lead.outcome ? outcomeLabel(lead.outcome) : "Never called"}
              </span>
            </div>
            <div className="lead-quick-actions">
              <label className="number-picker">
                <span className="sr-only">Number to dial</span>
                <select
                  name="number-to-dial"
                  aria-label="Number to dial"
                  value={numberChoice.leadId === lead.id && numberChoice.direct ? "direct" : "main"}
                  disabled={active}
                  onChange={(event) =>
                    setNumberChoice({ leadId: lead.id, direct: event.target.value === "direct" })
                  }
                >
                  <option value="main">Main number</option>
                  <option value="direct" disabled={!lead.direct}>
                    Direct number
                  </option>
                </select>
              </label>
              <button
                type="button"
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(active ? state.call!.phone : chosenPhone);
                    setStatus("Phone number copied.");
                  } catch {
                    setStatus("Clipboard unavailable. Select the displayed number to copy it.");
                  }
                }}
              >
                <Copy aria-hidden="true" size={14} /> Copy number
              </button>
              <button
                type="button"
                className="text-button"
                aria-pressed={guideVisible}
                onClick={() => setGuideVisible((value) => !value)}
              >
                <BookOpen aria-hidden="true" size={14} />
                {guideVisible ? "Hide call guide" : "Show call guide"}
              </button>
            </div>
          </div>
          <div className={`lead-workspace ${contextExpanded ? "context-expanded" : ""}`}>
            <button
              type="button"
              className="button context-toggle"
              aria-expanded={contextExpanded}
              aria-controls="dialer-lead-context"
              onClick={() => setContextExpanded((value) => !value)}
            >
              <BookOpen aria-hidden="true" size={16} />
              {contextExpanded ? "Back to phone" : "ASK FOR & call guide"}
            </button>
            <div className="lead-context" id="dialer-lead-context">
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
                      onChange={(e) =>
                        dispatch({ type: "edit", patch: { direct: e.target.value } })
                      }
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
                  if (
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                  )
                    return;
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
                    {value === "notes" ? "Call guide" : `Past calls (${history.length})`}
                  </button>
                ))}
              </div>
              {tab === "notes" ? (
                <div
                  className={`call-guide ${guideVisible ? "" : "guide-hidden"}`}
                  role="tabpanel"
                  id="notes-panel"
                  aria-labelledby="notes-tab"
                >
                  {guideVisible ? (
                    <>
                      <div className="guide-head">
                        <span className="section-label">YOUR CALL GUIDE</span>
                        <button
                          type="button"
                          className="text-button"
                          aria-pressed={guideEditing}
                          onClick={() => setGuideEditing((value) => !value)}
                        >
                          <Pencil aria-hidden="true" size={14} />
                          {guideEditing ? "Done editing" : "Edit guide"}
                        </button>
                      </div>
                      {guideEditing ? (
                        <label className="field guide-editor">
                          <span>Talking points · saved with this lead</span>
                          <textarea
                            name="talking-points"
                            aria-label="Talking points"
                            value={guide}
                            onChange={(event) =>
                              dispatch({
                                type: "edit",
                                patch: { talkingPoints: event.target.value },
                              })
                            }
                          />
                        </label>
                      ) : (
                        <div className="guide-sections">
                          {guide
                            .split(/\n\n/)
                            .slice(0, 3)
                            .map((part, index) => {
                              const [heading, ...lines] = part.split("\n");
                              return (
                                <div key={index}>
                                  <span className="guide-step">
                                    {String(index + 1).padStart(2, "0")}
                                  </span>
                                  <div>
                                    <strong>{lines.length ? heading : "Talking point"}</strong>
                                    <p>{lines.length ? lines.join("\n") : heading}</p>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                      <p className="guide-hint">
                        Listen first. Capture the next step in your notes.
                      </p>
                    </>
                  ) : (
                    <div className="guide-rest">
                      <BookOpen aria-hidden="true" size={24} />
                      <strong>Space to focus on the conversation.</strong>
                      <p>Your call guide is a click away.</p>
                    </div>
                  )}
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
            </div>
            <section
              className="call-controls call-card"
              aria-label="Phone dialer"
              onKeyDown={(event) => {
                if (
                  !active ||
                  event.altKey ||
                  event.ctrlKey ||
                  event.metaKey ||
                  !/^[0-9*#]$/.test(event.key)
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                if (!state.call?.held) dispatch({ type: "digit", value: event.key });
              }}
            >
              <div className="phone-source" aria-label="Dialing source" hidden={active}>
                <button
                  type="button"
                  aria-pressed={!inlineManual}
                  disabled={active}
                  onClick={() => {
                    setInlineManual(false);
                    setManualError("");
                  }}
                >
                  Lead number
                </button>
                <button
                  type="button"
                  aria-pressed={inlineManual}
                  disabled={active}
                  onClick={() => {
                    setInlineManual(true);
                    setManualPhone("");
                    setManualError("");
                    document.getElementById("quick-dial-number")?.focus();
                  }}
                >
                  Any number
                </button>
              </div>
              <div className="phone-number-entry">
                <label className="sr-only" htmlFor="quick-dial-number">
                  Phone number
                </label>
                <input
                  id="quick-dial-number"
                  name="quick-dial-number"
                  type="tel"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Enter a number"
                  value={active ? state.call!.phone : inlineManual ? manualPhone : chosenPhone}
                  readOnly={active}
                  onChange={(event) => {
                    setInlineManual(true);
                    setManualPhone(event.target.value);
                    setManualError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    if (!active) {
                      if (inlineManual) dialManualNumber(manualPhone);
                      else startDial();
                    }
                  }}
                />
                {!active && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Delete last digit"
                    disabled={inlineManual && !manualPhone}
                    onClick={() => {
                      setInlineManual(true);
                      setManualPhone((inlineManual ? manualPhone : chosenPhone).slice(0, -1));
                      setManualError("");
                    }}
                  >
                    <Delete aria-hidden="true" size={19} />
                  </button>
                )}
              </div>
              <div className="phone-call-state" aria-live="polite">
                {manualError && !manual ? (
                  <p className="error phone-error" role="alert">
                    {manualError}
                  </p>
                ) : (
                  <>
                    <span className="call-status">
                      {active
                        ? state.call?.held
                          ? "On hold · simulated"
                          : "Simulated call connected"
                        : state.call
                          ? "Call ended"
                          : inlineManual
                            ? "Dial without adding a lead"
                            : "Ready to dial"}
                    </span>
                    <strong className="call-timer mono">
                      {formatDuration(state.call?.seconds ?? 0)}
                    </strong>
                  </>
                )}
              </div>
              <div className="phone-tools">
                <button
                  type="button"
                  id="dialer-mute"
                  disabled={!active}
                  aria-label={state.call?.muted ? "Unmute" : "Mute"}
                  aria-pressed={Boolean(state.call?.muted)}
                  onClick={() => dispatch({ type: "mute" })}
                >
                  {state.call?.muted ? (
                    <MicOff aria-hidden="true" size={21} />
                  ) : (
                    <Mic aria-hidden="true" size={21} />
                  )}
                  <span>{state.call?.muted ? "Unmute" : "Mute"}</span>
                </button>
                <button
                  type="button"
                  id="dialer-hold"
                  aria-label={state.call?.held ? "Resume call" : "Hold"}
                  disabled={!active}
                  aria-pressed={Boolean(state.call?.held)}
                  onClick={() => dispatch({ type: "hold" })}
                >
                  {state.call?.held ? (
                    <Play aria-hidden="true" size={21} />
                  ) : (
                    <Pause aria-hidden="true" size={21} />
                  )}
                  <span>{state.call?.held ? "Resume" : "Hold"}</span>
                </button>
                <button
                  type="button"
                  aria-label="Add participant"
                  disabled={!active || state.call?.held}
                  onClick={() => {
                    setParticipantError("");
                    setConference(true);
                  }}
                >
                  <Users aria-hidden="true" size={21} />
                  <span>Add call</span>
                </button>
              </div>
              <div
                className="keypad"
                role="group"
                aria-label={active ? "Call keypad" : "Dialing keypad"}
              >
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
                  (digit, index) => (
                    <button
                      type="button"
                      key={digit}
                      aria-label={active ? `Send digit ${digit}` : `Enter digit ${digit}`}
                      disabled={active && state.call?.held}
                      onClick={() => {
                        if (active) dispatch({ type: "digit", value: digit });
                        else {
                          setInlineManual(true);
                          setManualPhone((value) => (inlineManual ? value : "") + digit);
                          setManualError("");
                        }
                      }}
                    >
                      <span>{digit}</span>
                      <small aria-hidden="true">
                        {
                          [
                            "",
                            "ABC",
                            "DEF",
                            "GHI",
                            "JKL",
                            "MNO",
                            "PQRS",
                            "TUV",
                            "WXYZ",
                            "",
                            "+",
                            "",
                          ][index]
                        }
                      </small>
                    </button>
                  ),
                )}
              </div>
              {active && (
                <output className="phone-dtmf mono" aria-label="Sent keypad digits">
                  {state.call?.digits || "Keypad ready"}
                </output>
              )}
              {active ? (
                <button type="button" className="button danger phone-call-button" onClick={endCall}>
                  <PhoneOff aria-hidden="true" size={21} />
                  {state.call?.participants.length ? "End conference" : "End call"}
                </button>
              ) : (
                <button
                  id="dialer-dial"
                  type="button"
                  className="button primary phone-call-button"
                  aria-label={!inlineManual && blocked ? "Do not call" : "Dial · simulated"}
                  disabled={paused || (!inlineManual && blocked)}
                  onClick={() => {
                    if (inlineManual) dialManualNumber(manualPhone);
                    else startDial();
                  }}
                >
                  <Phone aria-hidden="true" size={21} />
                  {!inlineManual && blocked ? "Do not call" : "Call · simulated"}
                </button>
              )}
              <div className={`phone-card-footer ${active ? "is-active" : ""}`}>
                <button
                  type="button"
                  className="text-button"
                  disabled={active || blocked || paused || !history.length}
                  onClick={() => {
                    setInlineManual(false);
                    startDial(history[0]!.phone);
                  }}
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  Redial
                </button>
                <span className="recording-status">
                  {active
                    ? state.call?.recording
                      ? "Recording this call (demo)"
                      : "Recording off"
                    : `Auto recording ${state.recordingEnabled ? "on" : "off"}`}
                </span>
              </div>
              <div className="phone-device-row">
                <label className="mic-select">
                  <Mic aria-hidden="true" size={15} />
                  <span className="sr-only">Microphone</span>
                  <select
                    name="microphone"
                    value={state.preferences.microphone}
                    onChange={(event) =>
                      dispatch({ type: "preferences", patch: { microphone: event.target.value } })
                    }
                  >
                    <option value="default">Default mic · demo</option>
                    <option value="headset">USB headset · demo</option>
                  </select>
                </label>
                <button
                  id="dialer-help"
                  type="button"
                  className="icon-button"
                  aria-label="Keyboard shortcuts"
                  onClick={() => setShortcuts(true)}
                >
                  <Keyboard aria-hidden="true" size={16} />
                </button>
              </div>
              {active && Boolean(state.call?.participants.length) && (
                <div className="conference-participants" aria-label="Additional participants">
                  {state.call?.participants.map((person) => (
                    <div className="participant" key={person.phone}>
                      <span>
                        <strong>{person.name}</strong>
                        <span className="mono">{person.phone}</span>
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
            </section>
          </div>
        </Panel>
        <Panel className="outcome-panel">
          <div className="outcomes">
            <h2 id="outcome-heading" tabIndex={-1}>
              Call outcome
            </h2>
            <p>Select, then Save or Save & next.</p>
            <div className="outcome-groups">
              {[
                [
                  "Reached",
                  ["connected_dm", "connected_gk", "connected_other", "callback_requested"],
                ],
                ["Didn’t reach", ["voicemail", "no_answer", "busy", "bad_number"]],
                ["Close out", ["not_interested", "do_not_call"]],
              ].map(([label, values]) => (
                <div className="outcome-group" key={label as string}>
                  <h3>{label}</h3>
                  <div className="outcome-grid">
                    {(values as string[]).map((value) => {
                      const o = OUTCOMES.find((item) => item.value === value)!;
                      const key =
                        [
                          "connected_dm",
                          "connected_gk",
                          "connected_other",
                          "callback_requested",
                          "voicemail",
                          "no_answer",
                          "busy",
                          "bad_number",
                          "not_interested",
                          "do_not_call",
                        ].indexOf(value) + 1;
                      return (
                        <button
                          id={`dialer-outcome-${key % 10}`}
                          aria-label={o.label.replace("Connected - ", "Reached ")}
                          aria-keyshortcuts={String(key % 10)}
                          type="button"
                          key={o.value}
                          className={`outcome-option ${lead.outcome === o.value ? "selected" : ""}`}
                          aria-pressed={lead.outcome === o.value}
                          onClick={() => dispatch({ type: "edit", patch: { outcome: o.value } })}
                        >
                          <span className={`outcome-dot tone-${o.tone}`} />
                          <span>
                            {o.value === "callback_requested"
                              ? "Callback"
                              : o.label.replace("Connected - ", "Reached ")}
                          </span>
                          <kbd>{key % 10}</kbd>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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
          <div className="conversation-notes">
            <label className="field">
              <span>Context & conversation notes</span>
              <textarea
                id="call-notes"
                name="lead-notes"
                placeholder="What did they say? Who should you ask for?…"
                value={lead.notes}
                onChange={(event) =>
                  dispatch({ type: "edit", patch: { notes: event.target.value } })
                }
              />
            </label>
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
          <div className="lead-save-controls">
            <div className="inline-status" aria-live="polite">
              {error ? (
                <span className="error" role="alert">
                  {error}
                </span>
              ) : state.queueComplete ? (
                "Queue complete. Your final lead is saved."
              ) : dirty ? (
                status ? (
                  `${status} · Unsaved changes`
                ) : (
                  "Unsaved changes"
                )
              ) : (
                status || "Changes saved"
              )}
            </div>
            <div className="lead-save-actions">
              <button
                type="button"
                className="button"
                id="dialer-previous"
                aria-label="Previous"
                title="Previous lead · Alt + Left arrow"
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
              <button
                id="dialer-save-next"
                type="submit"
                data-next="true"
                className="button primary"
                disabled={active}
              >
                Save & next
                <ArrowRight aria-hidden="true" size={17} />
              </button>
            </div>
            <button
              id="dialer-book"
              aria-label="Book meeting"
              type="button"
              className="button booking-in-dialer"
              onClick={() => setBooking(true)}
            >
              <CalendarDays aria-hidden="true" size={17} />
              <span>Book meeting</span>
              <kbd>Alt B</kbd>
            </button>
          </div>
        </Panel>
      </div>
      {booking && (
        <BookingDialog
          state={state}
          dispatch={dispatch}
          open
          lockedLead
          onClose={() => setBooking(false)}
          onSaved={() => setStatus("Meeting saved for this lead. No invitation was sent.")}
        />
      )}
      <Modal
        open={shortcuts}
        onClose={() => setShortcuts(false)}
        title="Keyboard shortcuts"
        description="Shortcuts work in the calling tab, outside fields and dialogs. They never save or advance automatically."
      >
        <div className="shortcut-list">
          {[
            ["1–0", "Select a call outcome"],
            ["Alt D", "Dial the chosen number"],
            ["Alt H", "Hold / resume the call"],
            ["Alt M", "Mute / unmute"],
            ["Alt N", "Focus conversation notes"],
            ["Alt B", "Book a meeting"],
            ["Alt Enter", "Save & next"],
            ["Alt ←", "Previous lead"],
            ["?", "Open this guide"],
          ].map(([key, action]) => (
            <div key={key}>
              <span>{action}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </Modal>
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
            dialManualNumber(manualPhone, manualName);
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
