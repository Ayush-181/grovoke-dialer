import { dateAt, timeAt } from "./format";
import { useEffect, useState, type Dispatch } from "react";
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
import type { State, Action, Lead } from "./model";
import { isDirty } from "./model";
import { validateDraft, validateCustomValues, type FollowUp } from "./domain";
import { ContactsPanel, CustomFieldsEditor } from "./Contacts";
import { DataToolsPage } from "./DataTools";
import { dialNumber } from "./numbers";
import { bookingInstants } from "../lib/booking-time";
import { RecordingPlayback } from "./RecordingPlayback";
import { useRuntime } from "./runtime";
import "./records-workflows.css";
import { zones } from "./model";
import { Panel, PanelHead, Stat, Empty, Field, Modal } from "./components";
import { formatDuration, outcomeLabel, outcomeTone, OUTCOMES } from "../lib/outcomes";
import { MetricsGrid, Funnel, PeriodChart, OverviewActivityChart } from "./Analytics";
import { dateKey, inPeriod, metrics, sessionElapsed, sessionTime } from "./metrics";
import type { Page } from "./App";

async function persistAction(
  dispatch: (action: Action) => boolean | Promise<boolean>,
  action: Action,
): Promise<boolean> {
  return (await (dispatch(action) as unknown)) !== false;
}

type Props = {
  state: State;
  dispatch: (action: Action) => boolean | Promise<boolean>;
  notify: (message: string) => void;
  openLead: (id: string) => void;
};
export function Overview({
  state,
  navigate,
  openLead,
}: Props & { navigate: (page: Page, view?: "all" | "callbacks") => void }) {
  const runtime = useRuntime();
  const currentMonth = dateKey(new Date()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentMonth.slice(0, 4));
  const logs = inPeriod(state.logs, month);
  const m = metrics(logs);
  const previousMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1),
  )
    .toISOString()
    .slice(0, 7);
  const previous = metrics(inPeriod(state.logs, previousMonth));
  const yearly = inPeriod(state.logs, year);
  const months = [
    ...new Set([
      ...Array.from({ length: 36 }, (_, i) =>
        new Date(
          Date.UTC(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)) - 1 - i, 1),
        )
          .toISOString()
          .slice(0, 7),
      ),
      ...state.logs.map((log) => dateKey(log.at).slice(0, 7)),
    ]),
  ]
    .sort()
    .reverse();
  const delta = (value: number, before: number) =>
    before ? `${Math.round(((value - before) / before) * 100)}%` : "—";
  const upcoming = state.bookings
    .filter((booking) => new Date(booking.at).getTime() >= Date.now())
    .sort((a, b) => a.at.localeCompare(b.at));
  const callbacks = state.leads.filter((lead) => lead.callback);
  const hours = Math.floor(m.talk / 3600),
    minutes = Math.floor(m.talk / 60) % 60;
  return (
    <>
      <div className="overview-caption">
        <label className="overview-month">
          <span className="sr-only">Overview month</span>
          <select name="overview-month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((value) => (
              <option key={value} value={value}>
                {new Intl.DateTimeFormat("en", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${value}-01T00:00:00Z`))}
              </option>
            ))}
          </select>
        </label>
        <span>Monthly metrics · IST</span>
        <button className="button primary overview-open" onClick={() => navigate("dialer")}>
          <Phone aria-hidden="true" size={16} />
          Open dialer
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="stats-grid overview-stats">
        <Stat
          icon={Phone}
          label="Dials"
          value={String(m.dials)}
          detail={{ label: "Awaiting outcome", value: String(m.pending) }}
          change={delta(m.dials, previous.dials)}
          comparison={previous.dials ? "vs. previous month" : "No previous-month baseline"}
        />
        <Stat
          icon={Users}
          label="Connected"
          value={String(m.connected)}
          detail={{ label: "Connection rate", value: m.dials ? `${m.connectionRate}%` : "—" }}
          change={delta(m.connected, previous.connected)}
          comparison={previous.connected ? "vs. previous month" : "No previous-month baseline"}
          tone="blue"
        />
        <Stat
          icon={CalendarDays}
          label="Bookings"
          value={String(m.booked)}
          detail={{
            label: "Dial-to-booking rate",
            value: m.dials ? `${Math.round((m.booked / m.dials) * 100)}%` : "—",
          }}
          change={delta(m.booked, previous.booked)}
          comparison={previous.booked ? "vs. previous month" : "No previous-month baseline"}
          tone="amber"
        />
        <Stat
          icon={Clock3}
          label="Talk time"
          value={hours ? `${hours}h ${minutes}m` : `${minutes}m ${m.talk % 60}s`}
          detail={{ label: "Average per dial", value: m.dials ? formatDuration(m.average) : "—" }}
          change={delta(m.talk, previous.talk)}
          comparison={previous.talk ? "vs. previous month" : "No previous-month baseline"}
        />
      </div>
      <div className="dashboard-grid">
        <OverviewActivityChart logs={logs} month={month} />
        <Funnel logs={logs} />
        <Panel className="appointments-panel overview-followups">
          <section className="followup-section">
            <PanelHead
              title="Upcoming appointments"
              subtitle="Current follow-ups · next conversations"
              action={
                <button className="text-button" onClick={() => navigate("bookings")}>
                  View all <ArrowRight aria-hidden="true" size={14} />
                </button>
              }
            />
            <div
              className="followup-list appointments-list"
              role="region"
              aria-label="Upcoming appointments list"
              tabIndex={0}
            >
              {upcoming.map((booking) => (
                <button
                  className="appointment"
                  key={booking.id}
                  onClick={() => navigate("bookings")}
                >
                  <span className="appointment-icon">
                    <CalendarDays aria-hidden="true" size={19} />
                  </span>
                  <span>
                    <strong>
                      {state.leads.find((lead) => lead.id === booking.leadId)?.business ??
                        booking.title}
                    </strong>
                    <small>{booking.title}</small>
                    <span>
                      {dateAt(booking.at, booking.zone)} · {timeAt(booking.at, booking.zone)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" size={15} />
                </button>
              ))}
              {!upcoming.length && (
                <Empty
                  title="No upcoming appointments"
                  description="Your next appointments will appear here."
                />
              )}
            </div>
          </section>
          <section className="followup-section callback-section">
            <PanelHead
              title="Worth a callback"
              subtitle={`Current · ${callbacks.length} ${callbacks.length === 1 ? "lead" : "leads"} to follow up`}
              action={
                <button className="text-button" onClick={() => navigate("leads", "callbacks")}>
                  View all <ArrowRight aria-hidden="true" size={14} />
                </button>
              }
            />
            <div
              className="followup-list"
              role="region"
              aria-label="Worth a callback list"
              tabIndex={0}
            >
              {callbacks.map((lead) => (
                <button className="appointment" key={lead.id} onClick={() => openLead(lead.id)}>
                  <span className="appointment-icon">
                    <RotateCcw aria-hidden="true" size={19} />
                  </span>
                  <span>
                    <strong>{lead.business}</strong>
                    <small>{lead.contact}</small>
                    <span>
                      {lead.callbackReason || lead.notes || "Follow up when you’re ready."}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" size={15} />
                </button>
              ))}
              {!callbacks.length && (
                <Empty
                  title="No callbacks yet"
                  description="Flag a lead as worth a callback in the dialer."
                />
              )}
            </div>
          </section>
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
          <h2>
            {runtime.mode === "live"
              ? "Your connected workspace"
              : "Your original workspace stays safe."}
          </h2>
          <p>
            {runtime.mode === "live"
              ? "Workspace records and integrations use your existing Grovoke account. Check connection status in Settings."
              : "This preview uses synthetic leads and simulated services. Your Lovable app stays separate."}
          </p>
        </Panel>
      </div>

      <details className="annual-summary panel">
        <summary>
          Yearly summary <span>Explore a full year</span>
        </summary>
        <div className="annual-content">
          <label className="field">
            <span>Year</span>
            <select
              aria-label="Overview year"
              name="overview-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {Array.from({ length: 5 }, (_, i) =>
                String(Number(currentMonth.slice(0, 4)) - i),
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="annual-totals">
            <strong>{metrics(yearly).dials} dials</strong>
            <strong>{metrics(yearly).connected} connected</strong>
            <strong>{metrics(yearly).triage} triage held</strong>
            <strong>{metrics(yearly).offered} offered</strong>
            <strong>{metrics(yearly).booked} booked</strong>
            <strong>{formatDuration(metrics(yearly).talk)} talk time</strong>
            <strong>{metrics(yearly).callbacks} callbacks</strong>
            <strong>{metrics(yearly).connectionRate}% connection rate</strong>
          </div>
          <PeriodChart logs={yearly} period={year} annual />
        </div>
      </details>
    </>
  );
}

export function LeadsPage({
  state,
  dispatch,
  notify,
  openLead,
  view,
  onViewChange,
}: Props & { view: "all" | "callbacks"; onViewChange: (view: "all" | "callbacks") => void }) {
  const runtime = useRuntime();
  const [search, setSearch] = useState("");
  const [never, setNever] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [stage, setStage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [remove, setRemove] = useState(false);
  const [importing, setImporting] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [columns, setColumns] = useState<string[]>([
    "location",
    "phone",
    "outcome",
    "calls",
    "followup",
  ]);
  const callbacks = view === "callbacks";
  const blocked = Boolean(state.call?.active) || isDirty(state);
  const customColumns = state.customFields.filter((field) => field.showInTable);
  const visible = state.leads.filter((lead) => {
    const text = [
      lead.business,
      lead.contact,
      lead.city,
      lead.phone,
      lead.direct,
      lead.email,
      lead.notes,
      ...(lead.contacts ?? []).flatMap((contact) => [
        contact.name,
        contact.role,
        contact.phone,
        contact.email,
      ]),
      ...Object.values(lead.customValues ?? {}),
    ]
      .join(" ")
      .toLowerCase();
    return (
      text.includes(search.toLowerCase()) &&
      (!never || (!lead.outcome && lead.calls === 0)) &&
      (!callbacks || lead.callback) &&
      (!outcome || (outcome === "__blank" ? !lead.outcome : lead.outcome === outcome)) &&
      (!stage || lead.stageId === stage)
    );
  });
  const lastPage = Math.max(0, Math.ceil(visible.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const allSelected = rows.length > 0 && rows.every((lead) => selected.includes(lead.id));
  const reset = () => {
    setPage(0);
    setSelected([]);
  };
  const show = (name: string) => columns.includes(name);
  const changeView = (next: "all" | "callbacks") => {
    onViewChange(next);
    setSearch("");
    setNever(false);
    setOutcome("");
    setStage("");
    reset();
  };
  const openEditor = (lead?: Lead) => {
    setAdding(!lead);
    setEditorError("");
    setEditing(
      lead
        ? {
            ...lead,
            ...(lead.contacts
              ? { contacts: lead.contacts.map((contact) => ({ ...contact })) }
              : {}),
            customValues: { ...lead.customValues },
          }
        : {
            id: crypto.randomUUID(),
            business: "",
            category: "",
            city: "",
            zone: "America/New_York",
            phone: "",
            contact: "",
            role: "",
            direct: "",
            email: "",
            website: "",
            notes: "",
            outcome: "",
            calls: 0,
            callback: false,
            callbackAt: "",
            callbackReason: "",
            triage: false,
            offered: false,
            contacts: [],
            customValues: {},
            ...(state.stages[0] ? { stageId: state.stages[0].id } : {}),
          },
    );
  };
  return (
    <>
      <div className="page-actions">
        <div className="segmented">
          <button
            className={!callbacks ? "active" : ""}
            aria-pressed={!callbacks}
            onClick={() => changeView("all")}
          >
            All leads <b>{state.leads.length}</b>
          </button>
          <button
            className={callbacks ? "active" : ""}
            aria-pressed={callbacks}
            onClick={() => changeView("callbacks")}
          >
            <RotateCcw aria-hidden="true" size={14} />
            Worth a callback <b>{state.leads.filter((lead) => lead.callback).length}</b>
          </button>
        </div>
        <div className="records-actions">
          <button className="button" onClick={() => setColumnsOpen(true)}>
            <Settings2 aria-hidden="true" size={16} />
            Columns
          </button>
          <button className="button" onClick={() => setImporting(true)}>
            <Upload aria-hidden="true" size={16} />
            Import & export
          </button>
          <button className="button primary" disabled={blocked} onClick={() => openEditor()}>
            <Plus aria-hidden="true" size={16} />
            New lead
          </button>
        </div>
      </div>
      <Panel className="leads-table-panel">
        <div className="filters">
          <label className="search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">Search leads</span>
            <input
              name="search-leads"
              autoComplete="off"
              placeholder="Search business, contact, notes, number…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                reset();
              }}
            />
          </label>
          <label className="compact-select">
            <Filter aria-hidden="true" size={15} />
            <span className="sr-only">Filter by outcome</span>
            <select
              name="filter-outcome"
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
                reset();
              }}
            >
              <option value="">All outcomes</option>
              <option value="__blank">No outcome</option>
              {OUTCOMES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="compact-select">
            <span className="sr-only">Filter by stage</span>
            <select
              value={stage}
              onChange={(event) => {
                setStage(event.target.value);
                reset();
              }}
            >
              <option value="">All stages</option>
              {state.stages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={never}
              onChange={(event) => {
                setNever(event.target.checked);
                reset();
              }}
            />
            Never called
          </label>
          {(search || never || outcome || stage) && (
            <button
              className="text-button"
              onClick={() => {
                setSearch("");
                setNever(false);
                setOutcome("");
                setStage("");
                reset();
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {never && (
          <p className="records-filter-note">
            Never called means zero dial attempts and no outcome. Choose “No outcome” to include
            dialed leads awaiting a disposition.
          </p>
        )}
        {selected.length > 0 && (
          <div className="selection-bar">
            <strong>{selected.length} selected</strong>
            <button className="text-button" onClick={() => setSelected([])}>
              Clear selection
            </button>
            <button className="button" disabled={blocked} onClick={() => setRemove(true)}>
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
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...new Set([...selected, ...rows.map((lead) => lead.id)])]
                          : selected.filter((id) => !rows.some((lead) => lead.id === id)),
                      )
                    }
                  />
                </th>
                <th>Business & contact</th>
                {show("location") && <th>Location</th>}
                {show("phone") && <th>Phone</th>}
                {show("outcome") && <th>Outcome</th>}
                {show("stage") && <th>Stage</th>}
                {show("calls") && <th>Dials</th>}
                {show("followup") && <th>Follow-up</th>}
                {customColumns
                  .filter((field) => show(`custom:${field.id}`))
                  .map((field) => (
                    <th key={field.id}>{field.label}</th>
                  ))}
                <th>
                  <span className="sr-only">Lead actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.business}`}
                      checked={selected.includes(lead.id)}
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, lead.id]
                            : ids.filter((id) => id !== lead.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button className="table-business" onClick={() => openLead(lead.id)}>
                      {lead.business}
                    </button>
                    <small>
                      {lead.contact || "Add a contact"} · {lead.category || "Category not set"}
                    </small>
                  </td>
                  {show("location") && <td>{lead.city || "—"}</td>}
                  {show("phone") && <td className="mono">{lead.phone || "—"}</td>}
                  {show("outcome") && (
                    <td>
                      <span
                        className={`badge ${!lead.outcome ? "neutral" : outcomeTone(lead.outcome)}`}
                      >
                        {lead.outcome
                          ? outcomeLabel(lead.outcome)
                          : lead.calls
                            ? "Awaiting outcome"
                            : "Never called"}
                      </span>
                    </td>
                  )}
                  {show("stage") && (
                    <td>{state.stages.find((item) => item.id === lead.stageId)?.label || "—"}</td>
                  )}
                  {show("calls") && <td className="mono">{lead.calls}</td>}
                  {show("followup") && (
                    <td>
                      {lead.callback ? (
                        <span className="callback-label">
                          <RotateCcw aria-hidden="true" size={13} />
                          Worth a callback
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {customColumns
                    .filter((field) => show(`custom:${field.id}`))
                    .map((field) => (
                      <td key={field.id}>
                        {typeof lead.customValues?.[field.id] === "boolean"
                          ? lead.customValues[field.id]
                            ? "Yes"
                            : "No"
                          : String(lead.customValues?.[field.id] ?? "—")}
                      </td>
                    ))}
                  <td>
                    <div className="lead-table-actions">
                      <button
                        className="icon-button"
                        disabled={blocked}
                        aria-label={`Edit ${lead.business}`}
                        onClick={() => openEditor(lead)}
                      >
                        <Settings2 aria-hidden="true" size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Open ${lead.business} in dialer`}
                        onClick={() => openLead(lead.id)}
                      >
                        <ChevronRight aria-hidden="true" size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <Empty
            title="No leads match these filters"
            description="Clear a filter, add a lead or import a file."
          />
        )}
        <div className="table-footer">
          <span>
            {visible.length} of {state.leads.length} leads
          </span>
          <div className="records-actions">
            <label>
              Rows{" "}
              <select
                aria-label="Leads per page"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  reset();
                }}
              >
                {[25, 50, 100].map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
            <button
              className="text-button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous page
            </button>
            <span>
              {currentPage + 1} / {lastPage + 1}
            </span>
            <button
              className="text-button"
              disabled={currentPage >= lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              Next page
            </button>
          </div>
        </div>
      </Panel>
      <Modal
        open={remove}
        onClose={() => setRemove(false)}
        title="Delete selected lead records?"
        description="This removes the selected businesses from the workspace. Call history remains available."
      >
        <p>
          The selected business records will be removed. This action does not erase your call
          history.
        </p>
        <div className="modal-actions">
          <button className="button" onClick={() => setRemove(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            disabled={blocked}
            onClick={async () => {
              if (await persistAction(dispatch, { type: "deleteLeads", ids: selected })) {
                setSelected([]);
                setRemove(false);
              }
            }}
          >
            Delete records
          </button>
        </div>
      </Modal>
      <Modal
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        title="Lead columns"
        description="Choose the details shown beside business and contact names."
      >
        <div className="records-column-picker">
          {[
            ["location", "Location"],
            ["phone", "Phone"],
            ["outcome", "Outcome"],
            ["stage", "Stage"],
            ["calls", "Dials"],
            ["followup", "Follow-up"],
            ...customColumns.map((field) => [`custom:${field.id}`, field.label]),
          ].map(([id, label]) => (
            <label className="checkbox-label" key={id}>
              <input
                type="checkbox"
                checked={show(id!)}
                onChange={(event) =>
                  setColumns((items) =>
                    event.target.checked ? [...items, id!] : items.filter((item) => item !== id),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="button primary" onClick={() => setColumnsOpen(false)}>
            Done
          </button>
        </div>
      </Modal>
      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        title="Import & export"
        description={
          runtime.mode === "demo"
            ? "Review files locally with the test workspace. No external service is contacted."
            : "Review proposed changes before adding records to this workspace."
        }
      >
        <DataToolsPage state={state} dispatch={dispatch} />
      </Modal>
      <Modal
        open={Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setEditorError("");
        }}
        title={adding ? "New lead" : "Edit lead"}
        description="Keep business details, decision makers and research together. Saving never places a call."
      >
        {editing && (
          <form
            className="lead-editor-form"
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              const previous = state.leads.find((lead) => lead.id === editing.id);
              const error =
                validateDraft(editing, Date.now(), previous) ||
                validateCustomValues(state.customFields, editing.customValues);
              if (error) {
                setEditorError(error);
                return;
              }
              if (!editing.phone) {
                setEditorError("Enter a main phone number for this lead.");
                return;
              }
              const phone = dialNumber(editing.phone)!;
              if (
                state.leads.some(
                  (lead) => lead.id !== editing.id && dialNumber(lead.phone) === phone,
                )
              ) {
                setEditorError("That phone number already belongs to another business.");
                return;
              }
              const lead = {
                ...editing,
                phone,
                direct: editing.direct ? dialNumber(editing.direct)! : "",
                ...(editing.contacts
                  ? {
                      contacts: editing.contacts.map((contact) => ({
                        ...contact,
                        phone: contact.phone ? dialNumber(contact.phone)! : "",
                      })),
                    }
                  : {}),
              };
              if (
                await persistAction(
                  dispatch,
                  adding ? { type: "addLead", lead } : { type: "updateLead", lead },
                )
              )
                setEditing(null);
            }}
          >
            <div className="field-grid">
              <Field
                label="Business name"
                value={editing.business}
                onChange={(event) => setEditing({ ...editing, business: event.target.value })}
              />
              <Field
                label="Industry / category"
                value={editing.category}
                onChange={(event) => setEditing({ ...editing, category: event.target.value })}
              />
              <Field
                label="Business location"
                value={editing.city}
                onChange={(event) => setEditing({ ...editing, city: event.target.value })}
              />
              <Field
                label="Main phone number"
                type="tel"
                value={editing.phone}
                onChange={(event) => setEditing({ ...editing, phone: event.target.value })}
              />
              <Field
                label="Website"
                type="url"
                value={editing.website}
                onChange={(event) => setEditing({ ...editing, website: event.target.value })}
              />
              <label className="field">
                <span>Business timezone</span>
                <select
                  value={editing.zone}
                  onChange={(event) => setEditing({ ...editing, zone: event.target.value })}
                >
                  {zones.map((zone) => (
                    <option key={zone.value} value={zone.value}>
                      {zone.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Pipeline stage</span>
                <select
                  value={editing.stageId ?? ""}
                  onChange={(event) => setEditing({ ...editing, stageId: event.target.value })}
                >
                  {state.stages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ContactsPanel
              lead={editing}
              onChange={(patch) => setEditing({ ...editing, ...patch })}
            />
            <CustomFieldsEditor
              fields={state.customFields}
              values={editing.customValues ?? {}}
              onChange={(values) => setEditing({ ...editing, customValues: values })}
            />
            <label className="field">
              <span>Business research / notes</span>
              <textarea
                value={editing.notes}
                onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
              />
            </label>
            {editorError && (
              <p className="error" role="alert">
                {editorError}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={blocked}>
                Save lead
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function localFollowUpTime(at: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const value = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function FollowUpsPage({
  state,
  dispatch,
  openLead,
  now = new Date(),
}: Props & { now?: Date }) {
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    leadId: string;
    contactId: string;
    local: string;
    zone: string;
    reason: string;
    occurrence: string;
  } | null>(null);
  const [error, setError] = useState("");
  const today = dateKey(now);
  const pending = state.followUps
    .filter((item) => item.status === "pending")
    .sort((a, b) => a.at.localeCompare(b.at));
  const history = state.followUps
    .filter((item) => item.status !== "pending")
    .sort((a, b) => b.at.localeCompare(a.at));
  const allowed = (lead: Lead) =>
    !lead.suppressed &&
    lead.outcome !== "do_not_call" &&
    !state.stages.find((stage) => stage.id === lead.stageId)?.noFollowUps;
  const startEdit = (item?: FollowUp) => {
    const lead =
      state.leads.find((candidate) => candidate.id === item?.leadId) ??
      state.leads.find(allowed) ??
      state.leads[0];
    if (!lead) return;
    const zone = item?.zone ?? lead.zone;
    const local = item ? localFollowUpTime(item.at, zone) : "";
    const candidates = local ? bookingInstants(local, zone) : [];
    const occurrence = item
      ? String(
          Math.max(
            0,
            candidates.findIndex(
              (instant) => Math.abs(instant.getTime() - Date.parse(item.at)) < 60000,
            ),
          ),
        )
      : "";
    setEditing({
      id: item?.id ?? crypto.randomUUID(),
      leadId: lead.id,
      contactId: item?.contactId ?? "",
      local,
      zone,
      reason: item?.reason ?? "",
      occurrence,
    });
    setError("");
  };
  const groups = [
    {
      title: "Overdue",
      subtitle: "Past the promised time",
      items: pending.filter((item) => Date.parse(item.at) < now.getTime()),
    },
    {
      title: "Due today",
      subtitle: "Coming up today · IST",
      items: pending.filter(
        (item) => Date.parse(item.at) >= now.getTime() && dateKey(item.at) === today,
      ),
    },
    {
      title: "Coming up",
      subtitle: "Scheduled after today",
      items: pending.filter(
        (item) => Date.parse(item.at) >= now.getTime() && dateKey(item.at) !== today,
      ),
    },
  ];
  const selectedLead = state.leads.find((lead) => lead.id === editing?.leadId);
  const candidates = editing?.local ? bookingInstants(editing.local, editing.zone) : [];
  const renderRow = (item: FollowUp) => {
    const lead = state.leads.find((candidate) => candidate.id === item.leadId);
    const contact = lead?.contacts?.find((candidate) => candidate.id === item.contactId);
    return (
      <div
        className={`follow-up-row ${item.status !== "pending" ? "follow-up-completed" : ""}`}
        key={item.id}
      >
        <div className="follow-up-row-main">
          <strong>{lead?.business ?? "Deleted business"}</strong>
          {contact && (
            <small>
              {contact.name}
              {contact.role ? ` · ${contact.role}` : ""}
            </small>
          )}
          <p>{item.reason}</p>
          <small>
            {dateAt(item.at, item.zone)} · {timeAt(item.at, item.zone)}
          </small>
          <small>
            Your time: {dateAt(item.at)} · {timeAt(item.at, "Asia/Kolkata")}
          </small>
        </div>
        <div className="follow-up-row-actions">
          {item.status === "pending" ? (
            <>
              <button className="button" disabled={!lead} onClick={() => lead && openLead(lead.id)}>
                Open lead
              </button>
              <button
                className="button"
                disabled={!lead || !allowed(lead)}
                onClick={() => startEdit(item)}
              >
                Reschedule
              </button>
              <button
                className="button primary"
                onClick={() =>
                  dispatch({ type: "followUpStatus", id: item.id, status: "completed" })
                }
              >
                <Check aria-hidden="true" size={14} />
                Complete
              </button>
              <button
                className="text-button"
                onClick={() =>
                  dispatch({ type: "followUpStatus", id: item.id, status: "cancelled" })
                }
              >
                Cancel callback
              </button>
            </>
          ) : (
            <span className="badge neutral">
              {item.status === "completed" ? "Completed" : "Cancelled"}
            </span>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="follow-ups-page">
      <div className="page-actions">
        <p className="hint">
          Scheduled promises, grouped in IST. Manually flagged “Worth a callback” leads remain
          separate in Leads.
        </p>
        <button
          className="button primary"
          disabled={!state.leads.some(allowed)}
          onClick={() => startEdit()}
        >
          <Plus aria-hidden="true" size={16} />
          Schedule callback
        </button>
      </div>
      {groups.map((group) => (
        <Panel className="follow-up-group" key={group.title}>
          <PanelHead title={`${group.title} · ${group.items.length}`} subtitle={group.subtitle} />
          {group.items.length ? (
            group.items.map(renderRow)
          ) : (
            <Empty
              title={`No ${group.title.toLowerCase()} callbacks`}
              description="Only callbacks you schedule appear here."
            />
          )}
        </Panel>
      ))}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={showHistory}
          onChange={(event) => setShowHistory(event.target.checked)}
        />
        Show completed and cancelled callbacks
      </label>
      {showHistory && (
        <Panel className="follow-up-group">
          <PanelHead
            title="Callback history"
            subtitle="Explicitly completed or cancelled promises"
          />
          {history.length ? (
            history.map(renderRow)
          ) : (
            <Empty
              title="No completed callbacks"
              description="Completing or cancelling a callback keeps it in this history."
            />
          )}
        </Panel>
      )}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={
          state.followUps.some((item) => item.id === editing?.id)
            ? "Reschedule callback"
            : "Schedule callback"
        }
        description="Choose the business, person and a future local time. This schedules a reminder; it never places a call."
      >
        {editing && (
          <form
            className="follow-up-form"
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedLead || !allowed(selectedLead)) {
                setError(
                  "This lead cannot receive follow-ups in its current stage or suppression state.",
                );
                return;
              }
              if (!editing.reason.trim()) {
                setError("Add the reason for this callback.");
                return;
              }
              if (!candidates.length) {
                setError("Choose a valid time; this local time may fall in a daylight-saving gap.");
                return;
              }
              if (candidates.length > 1 && editing.occurrence === "") {
                setError("Choose the first or second occurrence of this repeated time.");
                return;
              }
              const instant = candidates[candidates.length > 1 ? Number(editing.occurrence) : 0];
              if (!instant || instant.getTime() <= Date.now()) {
                setError("Choose a future callback time.");
                return;
              }
              if (
                await persistAction(dispatch, {
                  type: "followUp",
                  followUp: {
                    id: editing.id,
                    leadId: editing.leadId,
                    ...(editing.contactId ? { contactId: editing.contactId } : {}),
                    at: instant.toISOString(),
                    zone: editing.zone,
                    reason: editing.reason.trim(),
                    status: "pending",
                  },
                })
              )
                setEditing(null);
            }}
          >
            <label className="field">
              <span>Callback business</span>
              <select
                value={editing.leadId}
                onChange={(event) => {
                  const lead = state.leads.find((item) => item.id === event.target.value)!;
                  setEditing({
                    ...editing,
                    leadId: lead.id,
                    zone: lead.zone,
                    contactId: "",
                    local: "",
                    occurrence: "",
                  });
                }}
              >
                {state.leads.map((lead) => (
                  <option key={lead.id} value={lead.id} disabled={!allowed(lead)}>
                    {lead.business}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Callback contact</span>
              <select
                value={editing.contactId}
                onChange={(event) => setEditing({ ...editing, contactId: event.target.value })}
              >
                <option value="">Business / main contact</option>
                {(selectedLead?.contacts ?? []).map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                    {contact.role ? ` · ${contact.role}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Callback timezone</span>
              <select
                value={editing.zone}
                onChange={(event) =>
                  setEditing({ ...editing, zone: event.target.value, occurrence: "" })
                }
              >
                {zones.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="records-actions">
              {[
                [1, "Tomorrow"],
                [3, "+3 days"],
                [7, "+7 days"],
              ].map(([days, label]) => (
                <button
                  type="button"
                  className="button"
                  key={days}
                  onClick={() => {
                    const date = localFollowUpTime(new Date().toISOString(), editing.zone).slice(
                      0,
                      10,
                    );
                    const target = new Date(`${date}T12:00:00Z`);
                    target.setUTCDate(target.getUTCDate() + Number(days));
                    setEditing({
                      ...editing,
                      local: `${target.toISOString().slice(0, 10)}T10:00`,
                      occurrence: "",
                    });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <Field
              label="Callback date and time"
              type="datetime-local"
              value={editing.local}
              onChange={(event) =>
                setEditing({ ...editing, local: event.target.value, occurrence: "" })
              }
            />
            {candidates.length > 1 && (
              <label className="field">
                <span>Repeated local time</span>
                <select
                  value={editing.occurrence}
                  onChange={(event) => setEditing({ ...editing, occurrence: event.target.value })}
                >
                  <option value="">Choose occurrence</option>
                  {candidates.map((instant, index) => (
                    <option key={instant.toISOString()} value={index}>
                      {index === 0 ? "First" : "Second"} · {timeAt(instant, editing.zone)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Field
              label="Callback reason"
              value={editing.reason}
              onChange={(event) => setEditing({ ...editing, reason: event.target.value })}
            />
            {candidates.length === 1 && (
              <p className="hint">
                Your time: {dateAt(candidates[0]!)} · {timeAt(candidates[0]!, "Asia/Kolkata")}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="button primary">
                Save callback
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export function SessionsPage({
  state,
  dispatch,
  notify,
  startQueue,
  now,
}: Props & { startQueue: (id: string) => void; now: Date }) {
  const runtime = useRuntime();
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
                  {s.status[0]!.toUpperCase() + s.status.slice(1)}
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
              <div className="session-totals">
                <div>
                  <span>Session time</span>
                  <strong className="mono" aria-label={`${s.name} session time`}>
                    {sessionTime(sessionElapsed(s, now.getTime()))}
                  </strong>
                </div>
                <div>
                  <span>Talk time</span>
                  <strong className="mono">
                    {formatDuration(
                      metrics(state.logs.filter((log) => log.sessionId === s.id)).talk,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Calls</span>
                  <strong className="mono">
                    {state.logs.filter((log) => log.sessionId === s.id).length}
                  </strong>
                </div>
              </div>
              <div className="session-card-actions">
                {s.status === "running" ? (
                  <>
                    <button
                      className="button"
                      disabled={Boolean(state.call?.active)}
                      onClick={() =>
                        dispatch({
                          type: "setSessionStatus",
                          id: s.id,
                          status: "paused",
                          now: now.getTime(),
                        })
                      }
                    >
                      <Pause aria-hidden="true" size={16} />
                      Pause
                    </button>
                    <button
                      className="button"
                      onClick={async () => {
                        if (
                          state.call?.active &&
                          !(await persistAction(dispatch, { type: "end", at: now.toISOString() }))
                        )
                          return;
                        await persistAction(dispatch, {
                          type: "setSessionStatus",
                          id: s.id,
                          status: "stopped",
                          now: now.getTime(),
                        });
                      }}
                    >
                      Stop session
                    </button>
                  </>
                ) : (
                  <button
                    className="button primary"
                    disabled={
                      Boolean(state.call?.active) ||
                      !s.leadIds.length ||
                      Boolean(state.activeSessionId && state.activeSessionId !== s.id)
                    }
                    onClick={() => startQueue(s.id)}
                  >
                    <Play aria-hidden="true" size={16} />
                    {s.status === "paused" ? "Resume session" : "Start session"}
                  </button>
                )}
                {s.status === "paused" && (
                  <button
                    className="button"
                    onClick={() =>
                      dispatch({
                        type: "setSessionStatus",
                        id: s.id,
                        status: "stopped",
                        now: now.getTime(),
                      })
                    }
                  >
                    Stop session
                  </button>
                )}
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
          onSubmit={async (e) => {
            e.preventDefault();
            const ids = state.leads
              .filter(
                (l) =>
                  l.outcome !== "do_not_call" &&
                  (filter === "new"
                    ? !l.outcome && l.calls === 0
                    : filter === "callbacks"
                      ? l.callback
                      : true),
              )
              .map((l) => l.id);
            if (!ids.length) {
              notify("No eligible leads match. Choose another filter.");
              return;
            }
            if (
              !(await persistAction(dispatch, {
                type: "session",
                session: {
                  id: crypto.randomUUID(),
                  name,
                  leadIds: ids,
                  paused: false,
                  status: "ready",
                  elapsedMs: 0,
                  startedAt: null,
                },
              }))
            )
              return;
            setCreating(false);
            setName("");
            notify("Your calling session is ready.");
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
  const runtime = useRuntime();
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [day, setDay] = useState(() => dateKey(new Date()));
  const daily = inPeriod(state.logs, day);
  const [search, setSearch] = useState("");
  const [recordings, setRecordings] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const visible = daily.filter(
    (l) =>
      (!recordings || l.recording) &&
      `${state.leads.find((lead) => lead.id === l.leadId)?.business ?? "Deleted lead"} ${l.notes} ${outcomeLabel(l.outcome)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const log = state.logs.find((l) => l.id === detail);
  return (
    <>
      <div className="period-picker">
        <div>
          <strong>Daily activity / Call log</strong>
          <p>All calls and metrics for the selected day · IST</p>
        </div>
        <div className="date-controls">
          <label className="field">
            <span>Day</span>
            <input
              name="activity-date"
              aria-label="Activity date"
              type="date"
              value={day}
              onChange={(e) => {
                if (e.target.value) setDay(e.target.value);
              }}
            />
          </label>
          <button className="button" onClick={() => setDay(dateKey(new Date()))}>
            Today
          </button>
          {runtime.mode === "live" && (
            <button
              className="button"
              disabled={
                refreshing || runtime.pending || Boolean(state.call?.active) || isDirty(state)
              }
              onClick={async () => {
                setRefreshing(true);
                setRefreshError("");
                try {
                  await runtime.refresh?.();
                } catch {
                  setRefreshError("Could not refresh history. Try again.");
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {refreshing ? "Refreshing…" : "Refresh history"}
            </button>
          )}
        </div>
      </div>
      {refreshError && (
        <p className="error" role="alert">
          {refreshError}
        </p>
      )}
      <MetricsGrid logs={daily} detailed />
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
                    <small>
                      {l.phone} · Outbound{runtime.mode === "demo" ? " · simulated" : ""}
                    </small>
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
                        {runtime.mode === "demo" ? "Enabled · simulated" : "Requested"}
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
            description={
              runtime.mode === "demo"
                ? "Choose another day, change your search, or make a simulated call."
                : "Choose another day or change your search."
            }
          />
        )}
      </Panel>
      <Modal
        open={Boolean(log)}
        onClose={() => setDetail(null)}
        title="Call details"
        description={
          runtime.mode === "demo"
            ? "Review the saved outcome and notes for this simulated call."
            : "Review this call’s saved disposition, timing and notes."
        }
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
            <p className="mono">{log.phone}</p>
            {Boolean(log.heldSeconds) && (
              <p>
                On hold: {formatDuration(log.heldSeconds ?? 0)} · Talk time:{" "}
                {formatDuration(
                  log.talkSeconds ?? Math.max(0, log.seconds - (log.heldSeconds ?? 0)),
                )}
              </p>
            )}
            {Boolean(log.participants.length) && (
              <div className="call-detail-participants">
                <strong>Group call participants</strong>
                {log.participants.map((person) => (
                  <p key={person.phone}>
                    {person.name} · <span className="mono">{person.phone}</span>
                  </p>
                ))}
              </div>
            )}
            <p className="notes-copy">{log.notes || "No notes saved for this call."}</p>
            {log.recording && (
              <div className="info-banner">
                <Headphones aria-hidden="true" size={18} />
                {runtime.mode === "demo"
                  ? "Recording was enabled for this simulated call. The prototype does not capture audio."
                  : "Recording was requested for this call. Playback appears only after the provider confirms a recording is available."}
              </div>
            )}
            {runtime.mode === "live" && <RecordingPlayback id={log.id} />}
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
  const runtime = useRuntime();
  const [name, setName] = useState(state.preferences.workspaceName);
  const [connection, setConnection] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [connectingVoice, setConnectingVoice] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
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
              onClick={async () => {
                const enabled = !state.recordingEnabled;
                if (!(await persistAction(dispatch, { type: "recording", enabled }))) return;
                try {
                  localStorage.setItem("callboard-remake-recording", String(enabled));
                } catch {
                  /* Current session still works. */
                }
                notify(
                  `Automatic recording ${enabled ? "on" : "off"} for new ${runtime.mode === "demo" ? "simulated " : ""}calls.`,
                );
              }}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h3>Microphone</h3>
              <p>
                {runtime.mode === "live" && !runtime.voice?.ready
                  ? "Connect Voice to discover available input devices."
                  : "Your selected input stays visible in the call workspace."}
              </p>
            </div>
            <select
              disabled={runtime.mode === "live" && !runtime.voice?.ready}
              aria-label="Default microphone"
              name="default-microphone"
              value={state.preferences.microphone}
              onChange={(e) =>
                dispatch({ type: "preferences", patch: { microphone: e.target.value } })
              }
            >
              <option value="default">
                {runtime.mode === "demo"
                  ? "Default microphone (demo)"
                  : "System default microphone"}
              </option>
              {runtime.mode === "demo" ? (
                <option value="headset">USB headset (demo)</option>
              ) : (
                (runtime.voice?.inputDevices ?? [])
                  .filter((device) => device.id !== "default")
                  .map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))
              )}
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
                Day · Slate & Blue{theme === "day" && <Check aria-hidden="true" size={16} />}
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
                Night · Midnight & Blue{theme === "night" && <Check aria-hidden="true" size={16} />}
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
            onSubmit={async (e) => {
              e.preventDefault();
              setProfileMessage("");
              const data = new FormData(e.currentTarget);
              const workspaceName = name.trim();
              const displayName = String(data.get("your-display-name") ?? "").trim();
              const email = String(data.get("professional-email") ?? "").trim();
              if (
                !workspaceName ||
                !displayName ||
                (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
              ) {
                setProfileMessage("Enter a workspace name, display name and valid email.");
                return;
              }
              const saved = await persistAction(dispatch, {
                type: "preferences",
                patch: {
                  workspaceName,
                  displayName,
                  email,
                },
              });
              if (saved) setProfileMessage("Profile saved.");
            }}
          >
            <div className="field-grid">
              <Field
                label="Workspace label"
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
            {profileMessage && (
              <p className="hint" role="status">
                {profileMessage}
              </p>
            )}
          </form>
        </Panel>
        <Panel>
          <div id="integrations">
            <PanelHead
              title="Integrations"
              subtitle={
                runtime.mode === "live"
                  ? "Your existing Grovoke connections. Calls and invitations require a ready provider."
                  : "Disconnected test providers. No real calls, recordings or invitations are made."
              }
            />
          </div>
          {runtime.mode === "live" && (
            <div className="setting-row">
              <div>
                <h3>Workspace account</h3>
                <p>Return to the original app or sign out of this browser.</p>
              </div>
              <div className="records-actions">
                <a className="button" href="/dashboard">
                  Original app
                </a>
                <button
                  className="button"
                  disabled={Boolean(state.call?.active) || isDirty(state) || runtime.pending}
                  onClick={async () => {
                    try {
                      await runtime.signOut?.();
                    } catch {
                      setConnectionError("Could not sign out. Please try again.");
                    }
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
          <div className="setting-row">
            <div>
              <h3>Twilio Voice</h3>
              <p>Calling, conferences & recording</p>
              <div className="integration-state">
                <span
                  className={`badge ${runtime.mode === "demo" ? "neutral" : runtime.voice?.ready ? "good" : "warn"}`}
                >
                  {runtime.mode === "demo"
                    ? "Simulated provider"
                    : runtime.voice?.ready
                      ? "Connected"
                      : "Not connected"}
                </span>
                {runtime.mode === "live" && (
                  <span className="records-subtle">
                    {runtime.capabilities.conference
                      ? "Conference available"
                      : "Conference not configured"}
                  </span>
                )}
              </div>
            </div>
            <button
              className="button"
              disabled={connectingVoice || Boolean(state.call?.active)}
              onClick={async () => {
                if (runtime.mode === "demo") {
                  setConnection("Twilio Voice");
                  return;
                }
                setConnectionError("");
                setConnectingVoice(true);
                try {
                  if (!runtime.voice)
                    throw new Error(
                      "Voice connection is not available. Configure your calling account first.",
                    );
                  await runtime.voice.connect();
                } catch (error) {
                  setConnectionError(
                    error instanceof Error ? error.message : "Voice could not connect.",
                  );
                } finally {
                  setConnectingVoice(false);
                }
              }}
            >
              {runtime.mode === "demo"
                ? "Review setup"
                : connectingVoice
                  ? "Connecting…"
                  : runtime.voice?.ready
                    ? "Reconnect voice"
                    : "Connect voice"}
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          </div>
          {runtime.mode === "live" && runtime.voice?.error && (
            <p className="error records-profile-error" role="alert">
              {runtime.voice.error}
            </p>
          )}
          <div className="setting-row">
            <div>
              <h3>Google Calendar</h3>
              <p>Native invitations & availability</p>
              <div className="integration-state">
                <span
                  className={`badge ${runtime.mode === "demo" ? "neutral" : runtime.calendar?.connected ? "good" : "warn"}`}
                >
                  {runtime.mode === "demo"
                    ? "Simulated calendar"
                    : runtime.calendar?.connected
                      ? "Connected"
                      : runtime.calendar?.configured
                        ? "Not connected"
                        : "Client ID not configured"}
                </span>
                {runtime.calendar?.email && (
                  <span className="records-subtle">{runtime.calendar.email}</span>
                )}
              </div>
            </div>
            <button
              className="button"
              disabled={
                runtime.mode === "live" &&
                (!runtime.calendar?.configured || runtime.calendar.connecting)
              }
              onClick={async () => {
                if (runtime.mode === "demo") {
                  setConnection("Google Calendar");
                  return;
                }
                setConnectionError("");
                try {
                  await runtime.calendar?.connect(Boolean(runtime.calendar.connected));
                } catch (error) {
                  setConnectionError(
                    error instanceof Error ? error.message : "Google Calendar could not connect.",
                  );
                }
              }}
            >
              {runtime.mode === "demo"
                ? "Review setup"
                : runtime.calendar?.connecting
                  ? "Connecting…"
                  : runtime.calendar?.connected
                    ? "Change calendar account"
                    : "Connect Google Calendar"}
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          </div>
          {runtime.mode === "live" && runtime.calendar?.error && (
            <p className="error records-profile-error" role="alert">
              {runtime.calendar.error}
            </p>
          )}
          {connectionError && (
            <p className="error records-profile-error" role="alert">
              {connectionError}
            </p>
          )}
          {runtime.mode === "live" && (
            <p className="settings-hint">
              The invitation organizer is the connected calendar account. A Gmail sending alias
              alone does not change that identity.{" "}
              <a href="/settings">Manage the existing calling account</a>.
            </p>
          )}
        </Panel>
      </div>
      <Modal
        open={Boolean(connection)}
        onClose={() => setConnection("")}
        title={`${connection} setup`}
        description="This design sandbox is deliberately disconnected from live services."
      >
        <p>
          {connection === "Twilio Voice"
            ? "Voice uses your existing server-side Twilio connection in the connected application. This standalone test build has no microphone or provider access."
            : "The connected application uses native Google Calendar invitations and availability checks. The calendar account determines the organizer; a Gmail sending alias does not change it."}
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
