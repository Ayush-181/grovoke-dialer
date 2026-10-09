import { dateAt, timeAt } from "./format";
import { useState, type Dispatch } from "react";
import { CalendarDays, Check, Clock3, Plus, Search, Trash2, Video } from "lucide-react";
import type { Action, State } from "./model";
import { zones } from "./model";
import { Empty, Field, Modal, Panel, PanelHead } from "./components";
import { bookingInstants, displayBookingTime, overlapsBusy } from "../lib/booking-time";

export function BookingsPage({
  state,
  dispatch,
  notify,
}: {
  state: State;
  dispatch: Dispatch<Action>;
  notify: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const [leadId, setLeadId] = useState(state.selectedId);
  const lead = state.leads.find((l) => l.id === leadId) ?? state.leads[0]!;
  const [title, setTitle] = useState(`Ash x ${lead.business}`);
  const [zone, setZone] = useState(lead.zone);
  const [basis, setBasis] = useState("invitee");
  const [day, setDay] = useState("2026-10-12");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [guests, setGuests] = useState(lead.email);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [meet, setMeet] = useState(true);
  const [occurrence, setOccurrence] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [search, setSearch] = useState("");
  const selectionZone = basis === "india" ? "Asia/Kolkata" : zone;
  const instants = bookingInstants(`${day}T${time}`, selectionZone);
  const instant = instants[occurrence] ?? instants[0];
  const busy = state.bookings.map((b) => ({
    start: b.at,
    end: new Date(Date.parse(b.at) + b.duration * 60_000).toISOString(),
  }));
  const conflict = instant && overlapsBusy(instant, duration, busy);
  const visible = state.bookings.filter(
    (b) =>
      (filter === "past" ? Date.parse(b.at) < Date.now() : Date.parse(b.at) >= Date.now()) &&
      b.title.toLowerCase().includes(search.toLowerCase()),
  );
  function resetBooking() {
    const selected = state.leads.find((l) => l.id === state.selectedId) ?? state.leads[0]!;
    setLeadId(selected.id);
    setTitle(`Ash x ${selected.business}`);
    setGuests(selected.email);
    setZone(selected.zone);
    setNotes("");
    setLocation("");
    setError("");
    setOccurrence(0);
    setCreating(true);
  }
  return (
    <>
      <div className="page-actions">
        <div className="calendar-connection">
          <span className="stat-icon jade">
            <CalendarDays aria-hidden="true" size={20} />
          </span>
          <div>
            <strong>Google Calendar</strong>
            <small>Simulated connection · native invitations in the original app</small>
          </div>
          <span className="badge good">Preview</span>
        </div>
        <button className="button primary" onClick={resetBooking}>
          <Plus aria-hidden="true" size={16} />
          New booking
        </button>
      </div>
      <Panel className="booking-calendar">
        <PanelHead title="Your week at a glance" subtitle="Appointment times shown in IST" />
        <div className="calendar-strip">
          {Array.from({ length: 7 }, (_, i) => {
            const date = new Date(`2026-10-${String(12 + i).padStart(2, "0")}T12:00:00Z`);
            const dateValue = date.toISOString().slice(0, 10);
            const items = state.bookings.filter(
              (b) =>
                new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
                  new Date(b.at),
                ) === dateValue,
            );
            return (
              <div className="calendar-day" key={i}>
                <small>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</small>
                <strong>{12 + i}</strong>
                {items.length ? (
                  items.map((b) => (
                    <div className="calendar-event" key={b.id}>
                      <span>{timeAt(b.at, "Asia/Kolkata")}</span>
                      <strong>{b.title}</strong>
                    </div>
                  ))
                ) : (
                  <span className="calendar-free">No appointments</span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel>
        <div className="filters">
          <div className="segmented">
            {["upcoming", "past"].map((mode) => (
              <button
                key={mode}
                className={filter === mode ? "active" : ""}
                aria-pressed={filter === mode}
                onClick={() => setFilter(mode)}
              >
                {mode === "upcoming" ? "Upcoming" : "Past"}
              </button>
            ))}
          </div>
          <label className="search">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Search bookings</span>
            <input
              autoComplete="off"
              name="search-bookings"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search appointments…"
            />
          </label>
        </div>
        <div className="booking-list">
          {visible.map((b) => (
            <div className="booking-row" key={b.id}>
              <span className="appointment-icon">
                <CalendarDays aria-hidden="true" size={20} />
              </span>
              <div>
                <strong>{b.title}</strong>
                <small>
                  {dateAt(b.at, b.zone)} · {timeAt(b.at, b.zone)} · {b.duration} min
                </small>
                <span>Your time: {timeAt(b.at, "Asia/Kolkata")}</span>
              </div>
              <span className="badge neutral">
                {b.meet ? (
                  <>
                    <Video aria-hidden="true" size={13} />
                    Meet · demo
                  </>
                ) : (
                  "Appointment"
                )}
              </span>
              <button
                className="icon-button"
                aria-label={`Delete booking record ${b.title}`}
                onClick={() => setRemove(b.id)}
              >
                <Trash2 aria-hidden="true" size={17} />
              </button>
            </div>
          ))}
        </div>
        {!visible.length && (
          <Empty
            title="No appointments here yet"
            description="Create a demo booking to try the scheduling flow."
          />
        )}
      </Panel>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Book a conversation"
        description="Review the time in both zones. This prototype saves a demo record and sends no invitation."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!instant) {
              setError(
                "This local time does not exist during daylight saving. Choose another time.",
              );
              return;
            }
            if (instant.getTime() <= Date.now()) {
              setError("Choose a future appointment time.");
              return;
            }
            if (conflict) {
              setError("A demo appointment overlaps this time. Choose another slot.");
              return;
            }
            const emails = guests.split(/[;,\s]+/).filter(Boolean);
            if (
              !emails.length ||
              emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            ) {
              setError("Add at least one valid invitee email address.");
              document.getElementById("booking-guests")?.focus();
              return;
            }
            dispatch({
              type: "booking",
              booking: {
                id: crypto.randomUUID(),
                leadId: lead.id,
                title,
                at: instant.toISOString(),
                zone,
                duration,
                guests: emails.join(", "),
                notes: [location, notes].filter(Boolean).join("\n"),
                meet,
              },
            });
            setCreating(false);
            notify("Demo booking saved. No calendar invitation was sent.");
          }}
        >
          <label className="field">
            <span>Business lead</span>
            <select
              name="booking-lead"
              value={leadId}
              onChange={(e) => {
                const chosen = state.leads.find((l) => l.id === e.target.value)!;
                setLeadId(chosen.id);
                setTitle(`Ash x ${chosen.business}`);
                setGuests(chosen.email);
                setZone(chosen.zone);
                setOccurrence(0);
              }}
            >
              {state.leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.business}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Invite title"
            value={title}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="field-grid">
            <label className="field">
              <span>Invitee’s timezone</span>
              <select
                name="invitee-timezone"
                value={zone}
                onChange={(e) => {
                  setZone(e.target.value);
                  setOccurrence(0);
                }}
              >
                {zones.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Choose day & time in</span>
              <select
                name="time-basis"
                value={basis}
                onChange={(e) => {
                  setBasis(e.target.value);
                  setOccurrence(0);
                }}
              >
                <option value="invitee">Invitee’s local time</option>
                <option value="india">Your time · IST</option>
              </select>
            </label>
            <Field
              label="Day"
              type="date"
              value={day}
              required
              onChange={(e) => {
                setDay(e.target.value);
                setOccurrence(0);
              }}
            />
            <Field
              label="Another time"
              type="time"
              value={time}
              required
              onChange={(e) => {
                setTime(e.target.value);
                setOccurrence(0);
              }}
            />
          </div>
          <div className="booking-slot-head">
            <span className="section-label">
              EVERY HOUR · {zones.find((z) => z.value === selectionZone)?.label}
            </span>
            <label>
              <span className="sr-only">Appointment duration</span>
              <select
                name="appointment-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[15, 30, 45, 60].map((d) => (
                  <option value={d} key={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="time-slots">
            {Array.from({ length: 24 }, (_, hour) => {
              const wall = `${String(hour).padStart(2, "0")}:00`;
              const candidate = bookingInstants(`${day}T${wall}`, selectionZone)[0];
              const unavailable =
                !candidate ||
                candidate.getTime() <= Date.now() ||
                overlapsBusy(candidate, duration, busy);
              return (
                <button
                  type="button"
                  className={time === wall ? "selected" : ""}
                  aria-pressed={time === wall}
                  disabled={unavailable}
                  key={hour}
                  onClick={() => {
                    setTime(wall);
                    setOccurrence(0);
                  }}
                >
                  {new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(
                    new Date(`2026-01-01T${wall}:00Z`),
                  )}
                </button>
              );
            })}
          </div>
          {instants.length > 1 && (
            <label className="field">
              <span>This time occurs twice · select an occurrence</span>
              <select
                name="dst-occurrence"
                value={occurrence}
                onChange={(e) => setOccurrence(Number(e.target.value))}
              >
                {instants.map((date, i) => (
                  <option key={i} value={i}>
                    {displayBookingTime(date, selectionZone)} · {date.toISOString()}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="booking-conversion">
            <div>
              <small>YOUR TIME · INDIA</small>
              <strong>
                {instant ? displayBookingTime(instant, "Asia/Kolkata") : "Choose a valid time"}
              </strong>
            </div>
            <div>
              <small>INVITEE’S TIME</small>
              <strong>{instant ? displayBookingTime(instant, zone) : "Choose a valid time"}</strong>
            </div>
            <p>
              <Clock3 aria-hidden="true" size={13} />
              Same appointment · {duration} minutes · daylight saving applied
            </p>
          </div>
          <Field
            id="booking-guests"
            label="Invitees & CC"
            spellCheck={false}
            value={guests}
            required
            placeholder="contact@example.invalid, teammate@example.invalid…"
            onChange={(e) => setGuests(e.target.value)}
          />
          <details className="meeting-details">
            <summary>Meeting details · location, Google Meet & notes</summary>
            <Field
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <label className="checkbox-label">
              <input type="checkbox" checked={meet} onChange={(e) => setMeet(e.target.checked)} />
              Include Google Meet (simulated)
            </label>
            <label className="field">
              <span>Meeting notes</span>
              <textarea
                name="meeting-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </details>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {conflict && <p className="hint">This slot overlaps an existing demo appointment.</p>}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="button primary">
              <Check aria-hidden="true" size={16} />
              Save demo booking
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(remove)}
        onClose={() => setRemove(null)}
        title="Delete this booking record?"
        description="Remove only the app’s booking record. This action does not cancel a calendar event or notify invitees."
      >
        <div className="modal-actions">
          <button className="button" onClick={() => setRemove(null)}>
            Keep booking
          </button>
          <button
            className="button danger"
            onClick={() => {
              dispatch({ type: "deleteBooking", id: remove! });
              setRemove(null);
              notify("Demo booking record deleted.");
            }}
          >
            Delete record only
          </button>
        </div>
      </Modal>
    </>
  );
}
