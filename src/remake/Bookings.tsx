import { dateAt, timeAt } from "./format";
import { useEffect, useRef, useState, type Dispatch } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Plus,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import type { Action, Booking, State } from "./model";
import { zones } from "./model";
import { Empty, Field, Modal, Panel, PanelHead } from "./components";
import {
  bookingInstants,
  displayBookingTime,
  overlapsBusy,
  type BusyPeriod,
} from "../lib/booking-time";
import { useRuntime } from "./runtime";
import { dateKey } from "./metrics";
import "./dialer-completion.css";

function safeGoogleUrl(value: string | undefined, kind: "calendar" | "meet"): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (kind === "meet"
        ? url.hostname === "meet.google.com"
        : ["calendar.google.com", "www.google.com"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
export function BookingsPage({
  state,
  dispatch,
  notify,
}: {
  state: State;
  dispatch: Dispatch<Action>;
  notify: (message: string) => void;
}) {
  const runtime = useRuntime();
  const live = runtime.mode === "live";
  const [connectionError, setConnectionError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date(`${dateKey(new Date())}T12:00:00Z`);
    today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    return today.toISOString().slice(0, 10);
  });
  function moveWeek(days: number) {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    setWeekStart(date.toISOString().slice(0, 10));
  }
  async function connectCalendar(change = false) {
    setConnectionError("");
    if (!runtime.calendar) {
      setConnectionError(
        "Google Calendar is not configured. Open Settings to configure your OAuth client.",
      );
      return;
    }
    try {
      await runtime.calendar.connect(change);
    } catch (cause) {
      setConnectionError(
        cause instanceof Error ? cause.message : "Could not connect Google Calendar.",
      );
    }
  }
  const [creating, setCreating] = useState(false);
  const [remove, setRemove] = useState<string | null>(null);
  const [filter, setFilter] = useState("upcoming");
  const [search, setSearch] = useState("");
  const visible = state.bookings.filter(
    (b) =>
      (filter === "past" ? Date.parse(b.at) < Date.now() : Date.parse(b.at) >= Date.now()) &&
      b.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-actions">
        <div className="calendar-connection">
          <span className="stat-icon jade">
            <CalendarDays aria-hidden="true" size={20} />
          </span>
          <div>
            <strong>Google Calendar</strong>
            <small>
              {live
                ? runtime.calendar?.connected
                  ? `Invitations sent by ${runtime.calendar.email || "your connected Google account"}`
                  : "Connect Google Calendar to send native invitations"
                : "Simulated connection · native invitations in the original app"}
            </small>
          </div>
          {live ? (
            <button
              type="button"
              className="button"
              disabled={runtime.calendar?.connecting}
              onClick={() => void connectCalendar(Boolean(runtime.calendar?.connected))}
            >
              {runtime.calendar?.connecting
                ? "Connecting…"
                : runtime.calendar?.connected
                  ? "Change account"
                  : "Connect Google Calendar"}
            </button>
          ) : (
            <span className="badge good">Preview</span>
          )}
        </div>
        <button
          className="button primary"
          disabled={!state.leads.length || (live && !runtime.calendar?.connected)}
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" size={16} />
          New booking
        </button>
      </div>
      {(connectionError || runtime.calendar?.error) && (
        <p className="error" role="alert">
          {connectionError || runtime.calendar?.error}
        </p>
      )}
      <Panel className="booking-calendar">
        <PanelHead
          title="Your week at a glance"
          subtitle={`Appointment times shown in IST · week of ${dateAt(`${weekStart}T12:00:00Z`, "Asia/Kolkata")}`}
          action={
            <div className="calendar-week-actions">
              <button
                className="icon-button"
                aria-label="Previous calendar week"
                onClick={() => moveWeek(-7)}
              >
                <ArrowLeft aria-hidden="true" size={16} />
              </button>
              <button
                className="text-button"
                onClick={() => {
                  const date = new Date(`${dateKey(new Date())}T12:00:00Z`);
                  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
                  setWeekStart(date.toISOString().slice(0, 10));
                }}
              >
                Today
              </button>
              <button
                className="icon-button"
                aria-label="Next calendar week"
                onClick={() => moveWeek(7)}
              >
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            </div>
          }
        />
        <div className="calendar-strip">
          {Array.from({ length: 7 }, (_, i) => {
            const date = new Date(`${weekStart}T12:00:00Z`);
            date.setUTCDate(date.getUTCDate() + i);
            const dateValue = date.toISOString().slice(0, 10);
            const items = state.bookings.filter((b) => dateKey(b.at) === dateValue);
            return (
              <div className="calendar-day" key={i}>
                <small>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</small>
                <strong>{date.getUTCDate()}</strong>
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
              {(safeGoogleUrl(b.googleEventUrl, "calendar") ||
                safeGoogleUrl(b.meetUrl, "meet")) && (
                <div className="records-actions">
                  {safeGoogleUrl(b.googleEventUrl, "calendar") && (
                    <a
                      className="button"
                      href={b.googleEventUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open calendar
                    </a>
                  )}
                  {safeGoogleUrl(b.meetUrl, "meet") && (
                    <a
                      className="button"
                      href={b.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join Meet
                    </a>
                  )}
                </div>
              )}
              <span className="badge neutral">
                {b.meet ? (
                  <>
                    <Video aria-hidden="true" size={13} />
                    {live ? "Google Meet" : "Meet · demo"}
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
            description={
              live
                ? "Create an appointment to send a native Google Calendar invitation."
                : "Create a demo booking to try the scheduling flow."
            }
          />
        )}
      </Panel>
      {creating && (
        <BookingDialog
          state={state}
          dispatch={dispatch}
          open
          onClose={() => setCreating(false)}
          onSaved={() =>
            notify(
              live
                ? "Booking saved and Google Calendar invitation sent."
                : "Demo booking saved. No calendar invitation was sent.",
            )
          }
        />
      )}
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
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                const result = await (dispatch as (action: Action) => unknown)({
                  type: "deleteBooking",
                  id: remove!,
                });
                if (result === false) {
                  setConnectionError("The booking record could not be deleted. Try again.");
                  return;
                }
                setRemove(null);
                notify(
                  live
                    ? "Booking record deleted. The calendar event is unchanged."
                    : "Demo booking record deleted.",
                );
              } catch (cause) {
                setConnectionError(
                  cause instanceof Error ? cause.message : "Could not delete this record.",
                );
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting…" : "Delete record only"}
          </button>
        </div>
      </Modal>
    </>
  );
}

export function BookingDialog({
  state,
  dispatch,
  open,
  onClose,
  onSaved,
  lockedLead = false,
}: {
  state: State;
  dispatch: Dispatch<Action>;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lockedLead?: boolean;
}) {
  const runtime = useRuntime();
  const live = runtime.mode === "live";
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [bookingId] = useState(() => crypto.randomUUID());
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [creationAttempted, setCreationAttempted] = useState(false);
  const [providerBusy, setProviderBusy] = useState<BusyPeriod[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const getBusy = useRef(runtime.calendar?.getBusy);
  getBusy.current = runtime.calendar?.getBusy;
  const [leadId, setLeadId] = useState(state.selectedId);
  const lead = lockedLead
    ? state.draft
    : (state.leads.find((l) => l.id === leadId) ?? state.leads[0]!);
  const [title, setTitle] = useState(`Ash x ${lead.business}`);
  const [zone, setZone] = useState(lead.zone);
  const [basis, setBasis] = useState("invitee");
  const [day, setDay] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: lead.zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() + 86_400_000)),
  );
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [guests, setGuests] = useState(lead.email);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [meet, setMeet] = useState(true);
  const [occurrence, setOccurrence] = useState(0);
  const [error, setError] = useState("");
  const selectionZone = basis === "india" ? "Asia/Kolkata" : zone;
  const instants = bookingInstants(`${day}T${time}`, selectionZone);
  const instant = instants[occurrence] ?? instants[0];
  const busy = [
    ...providerBusy,
    ...state.bookings.map((b) => ({
      start: b.at,
      end: new Date(Date.parse(b.at) + b.duration * 60_000).toISOString(),
    })),
  ];
  useEffect(() => {
    if (!open || !live || !runtime.calendar?.connected || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const utcDay = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(utcDay.getTime()) || !getBusy.current) return;
    let current = true;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    setProviderBusy([]);
    void getBusy
      .current(new Date(utcDay.getTime() - 18 * 3600000), new Date(utcDay.getTime() + 42 * 3600000))
      .then((periods) => {
        if (current) setProviderBusy(periods);
      })
      .catch((cause) => {
        if (current)
          setAvailabilityError(
            cause instanceof Error
              ? cause.message
              : "Availability could not be checked. Try again.",
          );
      })
      .finally(() => {
        if (current) setAvailabilityLoading(false);
      });
    return () => {
      current = false;
    };
  }, [open, live, runtime.calendar?.connected, day, selectionZone, availabilityRefresh]);
  const conflict = instant && overlapsBusy(instant, duration, busy);
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submissionLock.current) onClose();
      }}
      title="Book a conversation"
      description={
        live
          ? `Review the time in both zones. Google Calendar sends the invitation from ${runtime.calendar?.email || "your connected account"}.`
          : "Review the time in both zones. This prototype saves a demo record and sends no invitation."
      }
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (submissionLock.current) return;
          if (!instant) {
            setError("This local time does not exist during daylight saving. Choose another time.");
            return;
          }
          if (!createdBooking && !creationAttempted && instant.getTime() <= Date.now()) {
            setError("Choose a future appointment time.");
            return;
          }
          if (!title.trim()) {
            setError("Enter an invitation title.");
            return;
          }
          if (!createdBooking && !creationAttempted && conflict) {
            setError("An appointment overlaps this time. Choose another slot.");
            return;
          }
          const emails = [...new Set(guests.split(/[;,\s]+/).filter(Boolean))];
          if (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            setError("Add at least one valid invitee email address.");
            document.getElementById("booking-guests")?.focus();
            return;
          }
          if (live && (!runtime.calendar?.connected || !runtime.capabilities.calendar)) {
            setError("Connect Google Calendar before sending the invitation.");
            return;
          }
          submissionLock.current = true;
          setSubmitting(true);
          setError("");
          try {
            let booking: Booking = createdBooking ?? {
              id: bookingId,
              leadId: lead.id,
              title: title.trim(),
              at: instant.toISOString(),
              zone,
              duration,
              guests: emails.join(", "),
              notes,
              location,
              meet,
              ...(state.call?.leadId === lead.id ? { originatingCallId: state.call.id } : {}),
            };
            if (live && !createdBooking) {
              if (!creationAttempted) {
                const periods = await runtime.calendar!.getBusy(
                  instant,
                  new Date(instant.getTime() + duration * 60000),
                );
                if (overlapsBusy(instant, duration, periods)) {
                  setError("Your Google Calendar is busy at that time. Choose another slot.");
                  return;
                }
              }
              setCreationAttempted(true);
              booking = await runtime.calendar!.createBooking(booking);
              setCreatedBooking(booking);
            }
            const result = await (dispatch as (action: Action) => unknown)({
              type: "booking",
              booking,
            });
            if (result === false) {
              setError(
                live
                  ? "The calendar invitation exists, but its app record could not be saved. Retry to save the record; no second invitation will be sent."
                  : "Could not save the booking. Try again.",
              );
              return;
            }
            onClose();
            onSaved();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "The booking could not be completed. Retry safely with the same invitation.",
            );
          } finally {
            submissionLock.current = false;
            setSubmitting(false);
          }
        }}
      >
        {live && !runtime.calendar?.connected && (
          <div className="calendar-connect-prompt">
            <p>Connect Google Calendar to check availability and send a native invitation.</p>
            <button
              type="button"
              className="button primary"
              disabled={runtime.calendar?.connecting}
              onClick={async () => {
                if (!runtime.calendar) {
                  setError(
                    "Google Calendar is not configured. Open Settings to configure your OAuth client.",
                  );
                  return;
                }
                try {
                  await runtime.calendar.connect();
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Could not connect Google Calendar.",
                  );
                }
              }}
            >
              {runtime.calendar?.connecting ? "Connecting…" : "Connect Google Calendar"}
            </button>
          </div>
        )}
        {createdBooking && (
          <p className="hint">
            The Google Calendar invitation has been created. Retry only saves its app record.
          </p>
        )}
        <fieldset className="booking-editor-fields" disabled={submitting || creationAttempted}>
          <label className="field">
            <span>Business lead</span>
            <select
              name="booking-lead"
              disabled={lockedLead}
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
          {live && runtime.calendar?.connected && (
            <div className="booking-availability" aria-live="polite">
              {availabilityLoading ? (
                "Checking Google Calendar…"
              ) : availabilityError ? (
                <>
                  <span className="error" role="alert">
                    {availabilityError}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setAvailabilityRefresh((value) => value + 1)}
                  >
                    Retry availability
                  </button>
                </>
              ) : (
                "Availability checked on your Google Calendar"
              )}
            </div>
          )}
          <div className="time-slots">
            {Array.from({ length: 24 }, (_, hour) => {
              const wall = `${String(hour).padStart(2, "0")}:00`;
              const candidates = bookingInstants(`${day}T${wall}`, selectionZone);
              const freeOccurrence = candidates.findIndex(
                (candidate) =>
                  candidate.getTime() > Date.now() && !overlapsBusy(candidate, duration, busy),
              );
              const unavailable =
                freeOccurrence < 0 ||
                (live &&
                  (availabilityLoading ||
                    Boolean(availabilityError) ||
                    !runtime.calendar?.connected));
              return (
                <button
                  type="button"
                  className={time === wall ? "selected" : ""}
                  aria-pressed={time === wall}
                  disabled={unavailable}
                  key={hour}
                  onClick={() => {
                    setTime(wall);
                    setOccurrence(Math.max(0, freeOccurrence));
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
              {live ? "Include Google Meet" : "Include Google Meet (simulated)"}
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
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {conflict && !creationAttempted && (
          <p className="hint">This slot overlaps an existing appointment.</p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" disabled={submitting} onClick={onClose}>
            {createdBooking ? "Close · calendar event remains" : "Cancel"}
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={
              submitting ||
              (live &&
                (!runtime.calendar?.connected ||
                  availabilityLoading ||
                  (Boolean(availabilityError) && !creationAttempted)))
            }
          >
            <Check aria-hidden="true" size={16} />
            {submitting
              ? "Saving…"
              : createdBooking
                ? "Retry saving record"
                : creationAttempted
                  ? "Retry invitation"
                  : live
                    ? "Send Google Calendar invite"
                    : "Save demo booking"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
