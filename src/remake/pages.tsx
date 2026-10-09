import { dateAt, timeAt } from "./format";
import { useState, type Dispatch } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Filter,
  Headphones,
  ListOrdered,
  Mic,
  Moon,
  Pause,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { State, Action } from "./model";
import { zones } from "./model";
import { Panel, PanelHead, Stat, Empty, Field, Modal } from "./components";
import { formatDuration, outcomeLabel, outcomeTone, OUTCOMES } from "../lib/outcomes";
import type { Page } from "./App";

type Props = {
  state: State;
  dispatch: Dispatch<Action>;
  notify: (message: string) => void;
  openLead: (id: string) => void;
};
const weeklyDials = [22, 25, 24, 28, 35, 26, 24];
const funnel = [
  ["Dials", 184, "100%"],
  ["Pickups", 76, "41%"],
  ["Conversations", 43, "23%"],
  ["Offered", 12, "7%"],
  ["Booked", 7, "4%"],
] as const;
export function Overview({ state, navigate }: Props & { navigate: (page: Page) => void }) {
  return (
    <>
      <div className="overview-caption">
        <span className="badge neutral">Sample week · Oct 5–11</span>
        <span>Illustrative analytics for design review</span>
      </div>
      <div className="stats-grid">
        <Stat icon={Phone} label="Dials" value="184" change="12%" />
        <Stat icon={Users} label="Connected" value="43" change="8%" tone="blue" />
        <Stat icon={CalendarDays} label="Bookings" value="7" change="133%" tone="amber" />
        <Stat icon={Clock3} label="Talk time" value="2h 12m" change="21%" />
      </div>
      <div className="dashboard-grid">
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
            aria-label="Sample calling activity: 184 dials, 43 connections and 7 bookings over seven days"
          >
            <div className="bar-chart">
              <div className="chart-axis">
                {[40, 30, 20, 10, 0].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
              <div className="chart-columns">
                {weeklyDials.map((n, i) => (
                  <div className="chart-day" key={i}>
                    <div className="bar-group">
                      <span
                        className="bar series-blue"
                        style={{ height: `${(n / 40) * 100}%` }}
                        title={`${n} dials`}
                      />
                      <span
                        className="bar series-jade"
                        style={{ height: `${([5, 7, 4, 6, 9, 7, 5][i]! / 40) * 100}%` }}
                      />
                      <span
                        className="bar series-amber"
                        style={{ height: `${([1, 1, 0, 1, 2, 1, 1][i]! / 40) * 100}%` }}
                      />
                    </div>
                    <small>
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                      <span>Oct {5 + i}</span>
                    </small>
                  </div>
                ))}
              </div>
            </div>
            <figcaption>Connections, not just activity. Keep building your momentum.</figcaption>
          </figure>
        </Panel>
        <Panel className="funnel-panel">
          <PanelHead title="Booking funnel" subtitle="From first dial to next steps" />
          <div className="funnel">
            {funnel.map(([label, count, percent], i) => (
              <div className="funnel-row" key={label}>
                <div className="funnel-stage">
                  <svg
                    viewBox="0 0 100 44"
                    role="img"
                    aria-label={`${label}: ${count}, ${percent} of dials`}
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
                <small>{percent}</small>
              </div>
            ))}
          </div>
          <p className="funnel-note">
            <span className="status-dot" />
            3.8% of dials become bookings
          </p>
        </Panel>
        <Panel className="appointments-panel">
          <PanelHead
            title="Upcoming appointments"
            subtitle="Your next conversations"
            action={
              <button className="text-button" onClick={() => navigate("bookings")}>
                View all
                <ArrowRight aria-hidden="true" size={14} />
              </button>
            }
          />
          <div className="appointments-list">
            {state.bookings.slice(0, 3).map((b) => (
              <button className="appointment" key={b.id} onClick={() => navigate("bookings")}>
                <span className="appointment-icon">
                  <CalendarDays aria-hidden="true" size={19} />
                </span>
                <span>
                  <strong>{state.leads.find((l) => l.id === b.leadId)?.business ?? b.title}</strong>
                  <small>{b.title}</small>
                  <span>
                    {dateAt(b.at, b.zone)} · {timeAt(b.at, b.zone)}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" size={15} />
              </button>
            ))}
          </div>
          <div className="next-step">
            <div>
              <small>A GOOD NEXT STEP</small>
              <strong>{state.leads.filter((l) => l.callback).length} lead worth a callback</strong>
              <p>A follow-up can make all the difference.</p>
            </div>
            <button className="button" onClick={() => navigate("leads")}>
              Review leads
              <ArrowRight aria-hidden="true" size={14} />
            </button>
          </div>
        </Panel>
      </div>
      <div className="overview-bottom">
        <Panel>
          <PanelHead
            title="A queue ready for your next session"
            subtitle={`${state.leads.filter((l) => !l.outcome).length} untouched businesses to get to know`}
          />
          <div className="session-preview">
            <span className="stat-icon jade">
              <ListOrdered aria-hidden="true" size={22} />
            </span>
            <div>
              <strong>Local businesses · First touch</strong>
              <p>Take one lead at a time. Save before moving on.</p>
            </div>
            <button className="button primary" onClick={() => navigate("dialer")}>
              Start calling
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          </div>
        </Panel>
        <Panel className="quiet-card">
          <ShieldCheck aria-hidden="true" size={24} />
          <h2>Your original workspace stays safe.</h2>
          <p>
            This preview uses synthetic leads and simulated services. Your Lovable app stays
            separate.
          </p>
        </Panel>
      </div>
    </>
  );
}

export function LeadsPage({ state, dispatch, notify, openLead }: Props) {
  const [search, setSearch] = useState("");
  const [never, setNever] = useState(false);
  const [callbacks, setCallbacks] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [remove, setRemove] = useState(false);
  const [importing, setImporting] = useState(false);
  const visible = state.leads.filter(
    (l) =>
      `${l.business} ${l.contact} ${l.city} ${l.phone}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!never || !l.outcome) &&
      (!callbacks || l.callback) &&
      (!outcome || l.outcome === outcome),
  );
  const allSelected = visible.length > 0 && visible.every((l) => selected.includes(l.id));
  return (
    <>
      <div className="page-actions">
        <div className="segmented">
          <span className="active">
            All leads <b>{state.leads.length}</b>
          </span>
          <button
            aria-pressed={callbacks}
            onClick={() => {
              setCallbacks((v) => !v);
              setSelected([]);
            }}
          >
            <RotateCcw aria-hidden="true" size={14} />
            Callbacks <b>{state.leads.filter((l) => l.callback).length}</b>
          </button>
        </div>
        <button className="button primary" onClick={() => setImporting(true)}>
          <Upload aria-hidden="true" size={16} />
          Import sample CSV
        </button>
      </div>
      <Panel className="leads-table-panel">
        <div className="filters">
          <label className="search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">Search leads</span>
            <input
              name="search-leads"
              autoComplete="off"
              placeholder="Search business, contact, city…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected([]);
              }}
            />
          </label>
          <label className="compact-select">
            <Filter aria-hidden="true" size={15} />
            <span className="sr-only">Filter by outcome</span>
            <select
              name="filter-outcome"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setSelected([]);
              }}
            >
              <option value="">All outcomes</option>
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={never}
              onChange={(e) => {
                setNever(e.target.checked);
                setSelected([]);
              }}
            />
            Never called
          </label>
          {(search || never || callbacks || outcome) && (
            <button
              className="text-button"
              onClick={() => {
                setSearch("");
                setNever(false);
                setCallbacks(false);
                setOutcome("");
                setSelected([]);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <strong>{selected.length} selected</strong>
            <button className="text-button" onClick={() => setSelected([])}>
              Clear selection
            </button>
            <button
              className="button"
              disabled={Boolean(state.call?.active)}
              onClick={() => setRemove(true)}
            >
              <Trash2 aria-hidden="true" size={14} />
              Delete records
            </button>
          </div>
        )}
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Leads table">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all visible leads"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? visible.map((l) => l.id) : [])}
                  />
                </th>
                <th>Business & contact</th>
                <th>Location</th>
                <th>Phone</th>
                <th>Outcome</th>
                <th>Dials</th>
                <th>Follow-up</th>
                <th>
                  <span className="sr-only">Open lead</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.business}`}
                      checked={selected.includes(l.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked ? [...ids, l.id] : ids.filter((id) => id !== l.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button className="table-business" onClick={() => openLead(l.id)}>
                      {l.business}
                    </button>
                    <small>
                      {l.contact || "Add a contact"} · {l.category}
                    </small>
                  </td>
                  <td>{l.city}</td>
                  <td className="mono">{l.phone}</td>
                  <td>
                    <span className={`badge ${!l.outcome ? "good" : outcomeTone(l.outcome)}`}>
                      {l.outcome ? outcomeLabel(l.outcome) : "Never called"}
                    </span>
                  </td>
                  <td className="mono">{l.calls}</td>
                  <td>
                    {l.callback ? (
                      <span className="callback-label">
                        <RotateCcw aria-hidden="true" size={13} />
                        Worth a callback
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Open ${l.business} in dialer`}
                      onClick={() => openLead(l.id)}
                    >
                      <ChevronRight aria-hidden="true" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <Empty
            title="No leads match these filters"
            description="Clear a filter or try a different search."
          />
        )}
        <div className="table-footer">
          <span>
            {visible.length} of {state.leads.length} leads
          </span>
          <span>Phone duplicates are removed on import</span>
        </div>
      </Panel>
      <Modal
        open={remove}
        onClose={() => setRemove(false)}
        title="Delete selected demo leads?"
        description="This removes synthetic lead records from this preview only."
      >
        <p>Call history stays available. At least one demo lead must remain.</p>
        <div className="modal-actions">
          <button className="button" onClick={() => setRemove(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={() => {
              if (selected.length >= state.leads.length) {
                notify("Keep at least one lead in the preview.");
                return;
              }
              dispatch({ type: "deleteLeads", ids: selected });
              setSelected([]);
              setRemove(false);
              notify("Selected demo leads removed. Unsaved or active leads are protected.");
            }}
          >
            Delete records
          </button>
        </div>
      </Modal>
      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        title="Preview a CSV import"
        description="Use a synthetic sample to review mapping and deduplication. No file or real lead data is uploaded."
      >
        <div className="import-zone">
          <Upload aria-hidden="true" size={28} />
          <strong>sample-businesses.csv</strong>
          <p>2 new businesses · 1 phone duplicate skipped</p>
        </div>
        <div className="mapping-grid">
          <span>business_name</span>
          <ArrowRight aria-hidden="true" size={14} />
          <strong>Business name</strong>
          <span>phone</span>
          <ArrowRight aria-hidden="true" size={14} />
          <strong>Normalized phone</strong>
          <span>owner_name</span>
          <ArrowRight aria-hidden="true" size={14} />
          <strong>ASK FOR · Name</strong>
        </div>
        <div className="modal-actions">
          <button className="button" onClick={() => setImporting(false)}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => {
              dispatch({
                type: "import",
                leads: ["Willow Plumbing", "Summit Glass"].map((business, i) => ({
                  ...state.leads[0]!,
                  id: `import-${i}`,
                  business,
                  phone: `+1212555011${i}`,
                  contact: "Demo contact",
                  notes: "",
                  outcome: "",
                  calls: 0,
                  callback: false,
                  callbackAt: "",
                  callbackReason: "",
                  triage: false,
                  offered: false,
                })),
              });
              setImporting(false);
              notify("Sample import complete. Duplicate phone numbers were skipped.");
            }}
          >
            Import sample leads
          </button>
        </div>
      </Modal>
    </>
  );
}

export function SessionsPage({
  state,
  dispatch,
  notify,
  startQueue,
}: Props & { startQueue: (ids: string[]) => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("new");
  return (
    <>
      <div className="page-actions">
        <span>
          {state.sessions.length} calling {state.sessions.length === 1 ? "session" : "sessions"}
        </span>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" size={16} />
          New session
        </button>
      </div>
      <div className="sessions-grid">
        {state.sessions.map((s) => {
          const completed = s.leadIds.filter(
            (id) => state.leads.find((l) => l.id === id)?.outcome,
          ).length;
          return (
            <Panel key={s.id} className="session-card">
              <div className="session-card-top">
                <span className="stat-icon jade">
                  <ListOrdered aria-hidden="true" size={22} />
                </span>
                <span className="badge neutral">
                  {s.paused ? "Paused" : completed === s.leadIds.length ? "Complete" : "Ready"}
                </span>
              </div>
              <h2>{s.name}</h2>
              <p>{s.leadIds.length} unique businesses · manual dialing</p>
              <div className="session-progress">
                <span>
                  {completed} of {s.leadIds.length} reviewed
                </span>
                <strong>
                  {s.leadIds.length ? Math.round((completed / s.leadIds.length) * 100) : 0}%
                </strong>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${s.leadIds.length ? (completed / s.leadIds.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="session-card-actions">
                <button
                  className="button"
                  onClick={() => dispatch({ type: "pauseSession", id: s.id })}
                >
                  {s.paused ? (
                    <Play aria-hidden="true" size={15} />
                  ) : (
                    <Pause aria-hidden="true" size={15} />
                  )}
                  {s.paused ? "Resume" : "Pause"}
                </button>
                <button
                  className="button primary"
                  disabled={Boolean(state.call?.active) || !s.leadIds.length || s.paused}
                  onClick={() => startQueue(s.leadIds)}
                >
                  Open queue
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create a focused queue"
        description="Choose the leads you want to work through. No call starts when you create or open a session."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const ids = state.leads
              .filter(
                (l) =>
                  l.outcome !== "do_not_call" &&
                  (filter === "new" ? !l.outcome : filter === "callbacks" ? l.callback : true),
              )
              .map((l) => l.id);
            if (!ids.length) {
              notify("No eligible leads match. Choose another filter.");
              return;
            }
            dispatch({
              type: "session",
              session: { id: crypto.randomUUID(), name, leadIds: ids, paused: false },
            });
            setCreating(false);
            setName("");
            notify("Your demo session is ready.");
          }}
        >
          <Field
            label="Session name"
            value={name}
            required
            placeholder="Roofing businesses · First touch…"
            onChange={(e) => setName(e.target.value)}
          />
          <label className="field">
            <span>Include leads</span>
            <select name="session-leads" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="new">Never called</option>
              <option value="callbacks">Worth a callback</option>
              <option value="all">All eligible leads</option>
            </select>
          </label>
          <p className="hint">
            Do-not-call leads are excluded. Duplicate numbers are kept out of the queue.
          </p>
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="button primary" type="submit">
              Create session
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ActivityPage({ state, openLead }: Props) {
  const [search, setSearch] = useState("");
  const [recordings, setRecordings] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const visible = state.logs.filter(
    (l) =>
      (!recordings || l.recording) &&
      `${state.leads.find((lead) => lead.id === l.leadId)?.business ?? "Deleted lead"} ${l.notes} ${outcomeLabel(l.outcome)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const log = state.logs.find((l) => l.id === detail);
  return (
    <>
      <div className="stats-grid activity-stats">
        <Stat
          icon={Phone}
          label="Calls in this preview"
          value={String(state.logs.length)}
          change="Demo"
        />
        <Stat
          icon={Clock3}
          label="Recorded talk time"
          value={formatDuration(state.logs.reduce((n, l) => n + l.seconds, 0))}
          change="Demo"
          tone="blue"
        />
        <Stat
          icon={RotateCcw}
          label="Worth a callback"
          value={String(state.leads.filter((l) => l.callback).length)}
          change="Demo"
          tone="amber"
        />
      </div>
      <Panel>
        <div className="filters">
          <label className="search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">Search call history</span>
            <input
              name="search-calls"
              autoComplete="off"
              placeholder="Search businesses, outcomes, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={recordings}
              onChange={(e) => setRecordings(e.target.checked)}
            />
            Recording enabled calls
          </label>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Call history">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>When · IST</th>
                <th>Duration</th>
                <th>Outcome</th>
                <th>Recording</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>
                      {state.leads.find((lead) => lead.id === l.leadId)?.business ?? "Deleted lead"}
                    </strong>
                    <small>Outbound · simulated</small>
                  </td>
                  <td>
                    {dateAt(l.at)}
                    <small>{timeAt(l.at, "Asia/Kolkata")}</small>
                  </td>
                  <td className="mono">{formatDuration(l.seconds)}</td>
                  <td>
                    <span className={`badge ${outcomeTone(l.outcome)}`}>
                      {l.outcome ? outcomeLabel(l.outcome) : "Awaiting outcome"}
                    </span>
                  </td>
                  <td>
                    {l.recording ? (
                      <span className="callback-label">
                        <Mic aria-hidden="true" size={14} />
                        Enabled · simulated
                      </span>
                    ) : (
                      "Off"
                    )}
                  </td>
                  <td>
                    <button className="button" onClick={() => setDetail(l.id)}>
                      <FileText aria-hidden="true" size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <Empty
            title="No calls match"
            description="Change your search or make a simulated call from the dialer."
          />
        )}
      </Panel>
      <Modal
        open={Boolean(log)}
        onClose={() => setDetail(null)}
        title="Call details"
        description="Review the saved outcome and notes for this simulated call."
      >
        {log && (
          <>
            <div className="detail-summary">
              <strong>
                {state.leads.find((l) => l.id === log.leadId)?.business ?? "Deleted lead"}
              </strong>
              <span>
                {outcomeLabel(log.outcome)} · {formatDuration(log.seconds)}
              </span>
            </div>
            <p className="notes-copy">{log.notes || "No notes saved for this call."}</p>
            {log.recording && (
              <div className="info-banner">
                <Headphones aria-hidden="true" size={18} />
                Recording was enabled for this simulated call. The prototype does not capture audio.
              </div>
            )}
            <div className="modal-actions">
              <button className="button" onClick={() => setDetail(null)}>
                Close
              </button>
              {state.leads.some((l) => l.id === log.leadId) && (
                <button
                  className="button primary"
                  onClick={() => {
                    setDetail(null);
                    openLead(log.leadId);
                  }}
                >
                  Open lead
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

export function TimezonesPage({ state, now }: Props & { now: Date }) {
  const [instant, setInstant] = useState("");
  const selectedDate = instant ? new Date(`${instant}:00+05:30`) : now;
  const value = Number.isNaN(selectedDate.getTime()) ? now : selectedDate;
  return (
    <>
      <Panel className="timezone-anchor">
        <div>
          <span className="eyebrow">YOUR ANCHOR · INDIA</span>
          <h2>{timeAt(value, "Asia/Kolkata")}</h2>
          <p>{dateAt(value)} · Asia/Kolkata</p>
        </div>
        <Field
          label="Compare a date & time in IST"
          type="datetime-local"
          value={instant}
          onChange={(e) => setInstant(e.target.value)}
        />
      </Panel>
      <div className="timezone-grid">
        {zones
          .filter((z) => z.value !== "Asia/Kolkata")
          .map((z) => (
            <Panel key={z.value} className="timezone-card">
              <span className="timezone-icon">
                <Clock3 aria-hidden="true" size={21} />
              </span>
              <span className="eyebrow">{z.label}</span>
              <h2 className="mono">{timeAt(value, z.value)}</h2>
              <p>{dateAt(value, z.value)}</p>
              <small>
                {state.leads.filter((l) => l.zone === z.value).length} leads in this timezone
              </small>
              <div className="timezone-foot">Daylight saving applied automatically</div>
            </Panel>
          ))}
      </div>
      <p className="hint">
        Arizona stays on Mountain Standard Time year-round. Date changes are shown when zones cross
        midnight.
      </p>
    </>
  );
}

export function SettingsPage({
  state,
  dispatch,
  notify,
  theme,
  setTheme,
}: Props & { theme: string; setTheme: (theme: string) => void }) {
  const [name, setName] = useState(state.preferences.workspaceName);
  const [connection, setConnection] = useState("");
  return (
    <div className="settings-layout">
      <div className="settings-nav">
        <a
          href="#settings"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("calling-preferences")?.scrollIntoView();
          }}
        >
          Calling
        </a>
        <a
          href="#settings"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("appearance")?.scrollIntoView();
          }}
        >
          Appearance
        </a>
        <a
          href="#settings"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("workspace-profile")?.scrollIntoView();
          }}
        >
          Workspace
        </a>
        <a
          href="#settings"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("integrations")?.scrollIntoView();
          }}
        >
          Integrations
        </a>
      </div>
      <div className="settings-panels">
        <Panel>
          <div id="calling-preferences">
            <PanelHead
              title="Calling preferences"
              subtitle="Set your defaults once. Stay focused on the conversation."
            />
          </div>
          <div className="setting-row">
            <div>
              <h3>Automatically record calls</h3>
              <p>
                Applies to every new dial. Changing this keeps an active call’s recording setting.
              </p>
            </div>
            <button
              className={`switch ${state.recordingEnabled ? "on" : ""}`}
              role="switch"
              aria-checked={state.recordingEnabled}
              aria-label="Automatically record calls"
              onClick={() => {
                const enabled = !state.recordingEnabled;
                dispatch({ type: "recording", enabled });
                try {
                  localStorage.setItem("callboard-remake-recording", String(enabled));
                } catch {
                  /* Current session still works. */
                }
                notify(`Automatic recording ${enabled ? "on" : "off"} for new simulated calls.`);
              }}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h3>Microphone</h3>
              <p>Your selected input stays visible in the call workspace.</p>
            </div>
            <select
              aria-label="Default microphone"
              name="default-microphone"
              value={state.preferences.microphone}
              onChange={(e) =>
                dispatch({ type: "preferences", patch: { microphone: e.target.value } })
              }
            >
              <option value="default">Default microphone (demo)</option>
              <option value="headset">USB headset (demo)</option>
            </select>
          </div>
          <div className="setting-row">
            <div>
              <h3>Advance after saving</h3>
              <p>Outcomes and typing never move you automatically.</p>
            </div>
            <span className="badge good">
              <Check aria-hidden="true" size={13} />
              Manual · Save & next
            </span>
          </div>
        </Panel>
        <Panel>
          <div id="appearance">
            <PanelHead title="Appearance" subtitle="One workspace, tuned for day and night." />
          </div>
          <div className="theme-choices">
            <button
              className={`theme-choice ${theme === "day" ? "selected" : ""}`}
              aria-pressed={theme === "day"}
              onClick={() => setTheme("day")}
            >
              <div className="theme-mini day">
                <span />
                <i />
                <i />
                <i />
              </div>
              <span>
                <Sun aria-hidden="true" size={16} />
                Day · Porcelain & Jade{theme === "day" && <Check aria-hidden="true" size={16} />}
              </span>
            </button>
            <button
              className={`theme-choice ${theme === "night" ? "selected" : ""}`}
              aria-pressed={theme === "night"}
              onClick={() => setTheme("night")}
            >
              <div className="theme-mini night">
                <span />
                <i />
                <i />
                <i />
              </div>
              <span>
                <Moon aria-hidden="true" size={16} />
                Night · Charcoal & Jade{theme === "night" && <Check aria-hidden="true" size={16} />}
              </span>
            </button>
          </div>
          <p className="settings-hint">
            Your choice is remembered. Chart colors and native controls adjust with the theme.
          </p>
        </Panel>
        <Panel>
          <div id="workspace-profile">
            <PanelHead title="Workspace profile" subtitle="A familiar name for your workspace." />
          </div>
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              dispatch({
                type: "preferences",
                patch: {
                  workspaceName: name,
                  displayName: String(data.get("your-display-name")),
                  email: String(data.get("professional-email")),
                },
              });
              notify("Workspace profile saved for this preview session.");
            }}
          >
            <div className="field-grid">
              <Field
                label="Workspace name"
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
              />
              <Field
                label="Your display name"
                defaultValue={state.preferences.displayName}
                required
              />
              <Field
                label="Professional email"
                type="email"
                defaultValue={state.preferences.email}
                spellCheck={false}
              />
              <label className="field">
                <span>Anchor timezone</span>
                <select name="anchor-timezone">
                  <option>India · Asia/Kolkata</option>
                </select>
              </label>
            </div>
            <button className="button primary" type="submit">
              Save profile
            </button>
          </form>
        </Panel>
        <Panel>
          <div id="integrations">
            <PanelHead
              title="Integrations"
              subtitle="Review connection controls without connecting real accounts."
            />
          </div>
          {["Twilio Voice", "Google Calendar"].map((service) => (
            <div className="setting-row" key={service}>
              <div>
                <h3>{service}</h3>
                <p>
                  {service === "Twilio Voice"
                    ? "Calling, conferences & recording"
                    : "Native invitations & availability"}
                </p>
              </div>
              <button className="button" onClick={() => setConnection(service)}>
                Review setup
                <ArrowRight aria-hidden="true" size={15} />
              </button>
            </div>
          ))}
        </Panel>
      </div>
      <Modal
        open={Boolean(connection)}
        onClose={() => setConnection("")}
        title={`${connection} setup preview`}
        description="This design sandbox is deliberately disconnected from live services."
      >
        <p>
          {connection === "Twilio Voice"
            ? "The original dialer retains its secure Twilio configuration. After design approval, these controls can use its existing server-side calling and conference services."
            : "The production integration will keep native Google Calendar invitations, availability checks, and account selection. A Gmail sending alias does not change the calendar organizer."}
        </p>
        <p className="hint">No credentials are collected in this preview.</p>
        <div className="modal-actions">
          <button className="button primary" onClick={() => setConnection("")}>
            Got it
          </button>
        </div>
      </Modal>
    </div>
  );
}
