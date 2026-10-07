import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Clock3, ExternalLink, Plus, RefreshCw, Video, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { EmbeddedCalendar } from "@/components/EmbeddedCalendar";
import { supabase } from "@/integrations/supabase/client";
import {
  bookingInstants,
  displayBookingTime,
  nextWeekdays,
  overlapsBusy,
} from "@/lib/booking-time";
import { calendarBusy } from "@/lib/google-calendar";
import { deliverBooking } from "@/lib/bookings";
import { HOME_ZONE, ZONES, deriveLeadZone, toDateTimeLocalValue, zoneDef } from "@/lib/timezones";
import { cn } from "@/lib/utils";
import type { Booking } from "@/lib/bookings";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({ meta: [{ title: "Bookings — Call Board" }] }),
  component: BookingsPage,
});

const US_ZONES = ZONES.filter(
  (zone) => zone.id.startsWith("America/") || zone.id.startsWith("Pacific/"),
);
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const SLOT_TIMES = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];
type GoogleConnection = ReturnType<typeof useGoogleCalendar>;

function BookingsPage() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const google = useGoogleCalendar();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(0);
  const [retrying, setRetrying] = useState<string | null>(null);
  const bookings = useQuery({
    queryKey: ["bookings", workspace?.id, view, page],
    enabled: !!workspace,
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspace!.id);
      const now = new Date().toISOString();
      query =
        view === "upcoming"
          ? query.or(`starts_at.gte.${now},status.eq.pending`)
          : query.lt("starts_at", now).eq("status", "confirmed");
      const { data, error, count } = await query
        .order("starts_at", { ascending: view === "upcoming" })
        .range(page * 20, page * 20 + 19);
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["bookings"] });
  const retry = async (booking: Booking) => {
    setRetrying(booking.id);
    try {
      if (google.email !== booking.google_account_email)
        throw new Error(`Connect ${booking.google_account_email} to retry this invitation.`);
      await deliverBooking(google.getToken(), booking);
      toast.success("Invitation synced with Google Calendar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sync invitation.");
    } finally {
      setRetrying(null);
      refresh();
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Bookings"
        subtitle="Book in your time. Keep everyone on the same page."
        actions={
          <Button onClick={() => setOpen(true)} disabled={!workspace}>
            <Plus className="h-4 w-4" /> New booking
          </Button>
        }
      />
      <div className="panel mb-5 flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Google Calendar</h2>
            <p className="text-xs text-muted-foreground">
              {google.email
                ? `Connected as ${google.email} · primary calendar`
                : "Connect your calendar to check availability and send invitations."}
            </p>
            {!google.configured && (
              <p className="mt-1 text-xs text-muted-foreground">
                Google connection hasn’t been configured for this app yet.
              </p>
            )}
            {google.error && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {google.error}
              </p>
            )}
          </div>
        </div>
        {google.email ? (
          <Button variant="outline" onClick={google.disconnect} disabled={!!retrying}>
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={!google.ready || google.connecting}
            onClick={google.connect}
          >
            {google.connecting ? "Connecting…" : "Connect Google Calendar"}
          </Button>
        )}
      </div>
      <EmbeddedCalendar connectedEmail={google.email} />
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
          {(["upcoming", "past"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setView(tab);
                setPage(0);
              }}
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-medium",
                view === tab ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              {tab === "upcoming" ? "Upcoming & pending" : "Past"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={bookings.isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", bookings.isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>
      {bookings.isError ? (
        <div className="panel p-6" role="alert">
          <p className="text-sm text-destructive">Bookings could not load.</p>
          <p className="mt-1 text-xs text-muted-foreground">{bookings.error.message}</p>
          <Button className="mt-3" variant="outline" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : bookings.isPending ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">Loading bookings…</div>
      ) : !bookings.data?.rows.length ? (
        <div className="panel flex flex-col items-center px-4 py-16 text-center">
          <CalendarDays className="mb-4 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">
            {view === "upcoming" ? "Your next appointment starts here" : "No past bookings"}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Select a day, compare IST with your invitee’s local time, and send a calendar
            invitation.
          </p>
          {view === "upcoming" && (
            <Button className="mt-5" onClick={() => setOpen(true)} disabled={!workspace}>
              <Plus className="h-4 w-4" /> Book an appointment
            </Button>
          )}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Appointment</th>
                <th className="p-4 font-medium">Your time · IST</th>
                <th className="p-4 font-medium">Invitee’s local time</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Calendar</th>
              </tr>
            </thead>
            <tbody>
              {bookings.data.rows.map((booking) => (
                <tr key={booking.id} className="border-b border-border last:border-0">
                  <td className="max-w-64 p-4">
                    <div className="font-semibold">{booking.title}</div>
                    <div className="mt-1 break-words text-muted-foreground">
                      {booking.attendees.join(", ")}
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-4">
                    <div>{displayBookingTime(new Date(booking.starts_at), HOME_ZONE)}</div>
                    <div className="mt-1 text-muted-foreground">
                      {Math.round(
                        (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000,
                      )}{" "}
                      min
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-4">
                    <div>
                      {displayBookingTime(new Date(booking.starts_at), booking.lead_timezone)}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {zoneDef(booking.lead_timezone).label}
                    </div>
                  </td>
                  <td className="p-4">
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-full px-2 py-1",
                        booking.status === "confirmed"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {booking.status === "confirmed" ? "Invite sent" : "Pending sync"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col items-start gap-2">
                      {booking.google_event_url && (
                        <a
                          href={booking.google_event_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary"
                        >
                          Open event <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {booking.meet_url && (
                        <a
                          href={booking.meet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary"
                        >
                          <Video className="h-3 w-3" /> Join Meet
                        </a>
                      )}
                      {booking.status === "pending" && booking.created_by === user?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!google.email || !!retrying}
                          onClick={() => void retry(booking)}
                        >
                          {retrying === booking.id ? "Syncing…" : "Retry sync"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!bookings.data?.count && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {bookings.data.count} bookings · page {page + 1}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(page + 1) * 20 >= bookings.data.count}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && workspace && user && (
          <BookingForm
            google={google}
            workspaceId={workspace.id}
            userId={user.id}
            close={() => setOpen(false)}
            refresh={refresh}
          />
        )}
      </Dialog>
    </div>
  );
}

function BookingForm({
  google,
  workspaceId,
  userId,
  close,
  refresh,
}: {
  google: GoogleConnection;
  workspaceId: string;
  userId: string;
  close: () => void;
  refresh: () => void;
}) {
  const [title, setTitle] = useState("Discovery call");
  const [lead, setLead] = useState<Tables<"leads"> | null>(null);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [zoneHint, setZoneHint] = useState<string | null>(null);
  const [leadZone, setLeadZone] = useState("America/New_York");
  const [anchor, setAnchor] = useState<"ist" | "lead">("lead");
  const [day, setDay] = useState(
    () => nextWeekdays(toDateTimeLocalValue(new Date(), "America/New_York").slice(0, 10))[0]!,
  );
  const [time, setTime] = useState("10:00");
  const [fold, setFold] = useState(0);
  const [duration, setDuration] = useState(30);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [addMeet, setAddMeet] = useState(true);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const zone = anchor === "ist" ? HOME_ZONE : leadZone;
  const choices = bookingInstants(`${day}T${time}`, zone);
  const instant = choices[fold] ?? choices[0];
  const today = toDateTimeLocalValue(new Date(), zone).slice(0, 10);
  const days = nextWeekdays(today);
  const validTime = !!instant && instant.getTime() > Date.now();

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const leads = useQuery({
    queryKey: ["booking-leads", workspaceId, searchTerm],
    enabled: searchTerm.trim().length >= 2 && !lead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", workspaceId)
        .ilike("business_name", `%${searchTerm.replace(/[%_]/g, "")}%`)
        .order("business_name")
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
  const startOfDay = bookingInstants(`${day}T00:00`, zone)[0];
  const nextDay = new Date(`${day}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endOfDay = Number.isNaN(nextDay.getTime())
    ? undefined
    : bookingInstants(`${nextDay.toISOString().slice(0, 10)}T00:00`, zone)[0];
  const availability = useQuery({
    queryKey: ["calendar-availability", google.email, workspaceId, day, zone],
    enabled: !!google.email && !!startOfDay && !!endOfDay,
    queryFn: () => calendarBusy(google.getToken(), startOfDay!, endOfDay!),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const busy =
    !!instant && !!availability.data && overlapsBusy(instant, duration, availability.data);
  const changeZone = (nextAnchor: "ist" | "lead", nextLeadZone: string) => {
    let occurrence = 0;
    if (instant) {
      const nextZone = nextAnchor === "ist" ? HOME_ZONE : nextLeadZone;
      const value = toDateTimeLocalValue(instant, nextZone);
      setDay(value.slice(0, 10));
      setTime(value.slice(11));
      occurrence = Math.max(
        0,
        bookingInstants(value, nextZone).findIndex((date) => date.getTime() === instant.getTime()),
      );
    }
    setAnchor(nextAnchor);
    setLeadZone(nextLeadZone);
    setFold(occurrence);
  };
  const selectLead = (selected: Tables<"leads">) => {
    setLead(selected);
    setSearch(selected.business_name);
    setTitle(`${selected.business_name} · Discovery call`.slice(0, 200));
    if (selected.email)
      setEmails((current) => [...new Set([...current, selected.email!.trim().toLowerCase()])]);
    const derived = deriveLeadZone(selected.state, selected.phone);
    if (derived.source === "unknown") {
      setZoneHint(
        "The lead’s timezone could not be inferred. Confirm the US timezone with your invitee before booking.",
      );
    } else {
      changeZone(anchor, derived.zone);
      setZoneHint(
        "Timezone suggested from the lead’s location. Confirm it with your invitee, especially in states with multiple timezones.",
      );
    }
  };
  const addEmails = () => {
    const parsed = emailInput
      .split(/[,;\s]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (parsed.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      setFormError("Enter valid invitee email addresses.");
      return;
    }
    setEmails((current) => [...new Set([...current, ...parsed])]);
    setEmailInput("");
    setFormError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!instant || !validTime || busy || !google.email) return;
    const invitees = [
      ...new Set([
        ...emails,
        ...emailInput
          .split(/[,;\s]+/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ]),
    ];
    if (!invitees.length || invitees.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      setFormError("Add at least one valid invitee email address.");
      return;
    }
    if (!title.trim()) {
      setFormError("Enter an invite title.");
      return;
    }
    setSending(true);
    setFormError(null);
    let saved = false;
    try {
      const token = google.getToken();
      // Recheck immediately before persisting; availability shown in the grid may be stale.
      const end = new Date(instant.getTime() + duration * 60_000);
      if (overlapsBusy(instant, duration, await calendarBusy(token, instant, end)))
        throw new Error("This time is now busy in Google Calendar. Choose another slot.");
      const id = crypto.randomUUID();
      const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
          id,
          workspace_id: workspaceId,
          created_by: userId,
          lead_id: lead?.id ?? null,
          title: title.trim(),
          starts_at: instant.toISOString(),
          ends_at: end.toISOString(),
          lead_timezone: leadZone,
          attendees: invitees,
          notes: notes.trim(),
          location: location.trim(),
          add_meet: addMeet,
          google_account_email: google.email,
          google_event_id: id.replace(/-/g, ""),
        })
        .select("*")
        .single();
      if (error) throw error;
      saved = true;
      await deliverBooking(token, booking);
      toast.success(
        `Invitation sent to ${invitees.length} ${invitees.length === 1 ? "guest" : "guests"}.`,
      );
      close();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not send the invitation.";
      if (saved) {
        close();
        toast.error(`${message} Your booking is saved as pending; use Retry sync to continue.`);
      } else setFormError(message);
    } finally {
      setSending(false);
      refresh();
    }
  };

  return (
    <DialogContent
      className={cn("max-h-[90vh] overflow-y-auto sm:max-w-xl", sending && "[&>button]:hidden")}
      onInteractOutside={(e) => {
        if (sending) e.preventDefault();
      }}
      onEscapeKeyDown={(e) => {
        if (sending) e.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>Book an appointment</DialogTitle>
        <DialogDescription>
          Choose a time in IST or your invitee’s timezone. Both dates stay visible before you send.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <fieldset disabled={sending} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="booking-lead">
              Business / lead <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="booking-lead"
                value={search}
                placeholder="Search your leads by business name…"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLead(null);
                }}
              />
              {lead && (
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Clear selected lead"
                  onClick={() => {
                    setLead(null);
                    setSearch("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!lead && searchTerm.trim().length >= 2 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                {leads.isFetching ? (
                  <p className="p-3 text-xs text-muted-foreground">Searching…</p>
                ) : leads.isError ? (
                  <p className="p-3 text-xs text-destructive">
                    Could not search leads. You can still enter the appointment manually.
                  </p>
                ) : !leads.data?.length ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No matching leads. You can book without selecting a lead.
                  </p>
                ) : (
                  leads.data.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted"
                      onClick={() => selectLead(item)}
                    >
                      <span className="font-medium">{item.business_name}</span>
                      <span className="text-muted-foreground">
                        {item.city}
                        {item.state && `, ${item.state}`}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-title">Invite title</Label>
            <Input
              id="booking-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-zone">Invitee’s US timezone</Label>
              <select
                id="booking-zone"
                className={selectClass}
                value={leadZone}
                onChange={(e) => {
                  changeZone(anchor, e.target.value);
                  setZoneHint(null);
                }}
              >
                {US_ZONES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.short}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-anchor">Choose day & time in</Label>
              <select
                id="booking-anchor"
                className={selectClass}
                value={anchor}
                onChange={(e) => changeZone(e.target.value as "ist" | "lead", leadZone)}
              >
                <option value="ist">My time · India (IST)</option>
                <option value="lead">Invitee’s time · {zoneDef(leadZone).label}</option>
              </select>
            </div>
          </div>
          {lead && zoneHint && <p className="-mt-3 text-xs text-muted-foreground">{zoneHint}</p>}
          <div className="space-y-2">
            <Label>Day · {anchor === "ist" ? "IST" : zoneDef(leadZone).label}</Label>
            <div className="grid grid-cols-5 gap-2">
              {days.map((date) => {
                const d = new Date(`${date}T12:00:00Z`);
                return (
                  <button
                    type="button"
                    key={date}
                    aria-pressed={day === date}
                    onClick={() => {
                      setDay(date);
                      setFold(0);
                    }}
                    className={cn(
                      "rounded-xl border p-2.5 text-center transition-colors",
                      day === date
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="block text-[10px] uppercase text-muted-foreground">
                      {d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                    </span>
                    <span className="my-1 block text-lg font-semibold">{d.getUTCDate()}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="booking-date" className="text-xs text-muted-foreground">
                Another date
              </Label>
              <Input
                id="booking-date"
                type="date"
                min={today}
                required
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setFold(0);
                }}
                className="w-auto"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Time · {anchor === "ist" ? "IST" : zoneDef(leadZone).label}</Label>
              <div className="flex gap-1">
                {[15, 30, 45, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={duration === minutes}
                    onClick={() => setDuration(minutes)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      duration === minutes
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {SLOT_TIMES.map((slot) => {
                const candidate = bookingInstants(`${day}T${slot}`, zone)[0];
                const unavailable =
                  !candidate ||
                  candidate.getTime() <= Date.now() ||
                  (!!availability.data && overlapsBusy(candidate, duration, availability.data));
                const label = candidate
                  ? new Intl.DateTimeFormat("en-US", {
                      timeZone: zone,
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(candidate)
                  : slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={unavailable}
                    aria-pressed={slot === time}
                    onClick={() => {
                      setTime(slot);
                      setFold(0);
                    }}
                    className={cn(
                      "rounded-md border px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through",
                      slot === time
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <Label
                htmlFor="booking-time"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Clock3 className="h-3 w-3" /> Another time
              </Label>
              <Input
                id="booking-time"
                type="time"
                step={60}
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setFold(0);
                }}
                required
                className="w-auto"
              />
            </div>
            {choices.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="booking-fold">
                  This time occurs twice when daylight saving ends
                </Label>
                <select
                  id="booking-fold"
                  className={selectClass}
                  value={fold}
                  onChange={(e) => setFold(Number(e.target.value))}
                >
                  {choices.map((choice, i) => (
                    <option value={i} key={choice.toISOString()}>
                      {i === 0 ? "First" : "Second"} occurrence · {displayBookingTime(choice, zone)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!choices.length && (
              <p className="text-xs text-destructive" role="alert">
                This local time does not exist. Choose another time (check the date and
                daylight-saving change).
              </p>
            )}
            {instant && !validTime && (
              <p className="text-xs text-destructive">Choose a future appointment time.</p>
            )}
            {google.email && availability.isFetching && (
              <p className="text-xs text-muted-foreground">Checking your Google Calendar…</p>
            )}
            {google.email && availability.isError && (
              <div className="text-xs text-destructive" role="alert">
                {availability.error.message}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void availability.refetch()}
                >
                  Try again
                </button>
              </div>
            )}
            {busy && (
              <p className="text-xs text-destructive">
                Your calendar is busy at this time. Choose another slot.
              </p>
            )}
            {google.email &&
              validTime &&
              availability.isSuccess &&
              !availability.isFetching &&
              !busy && (
                <p className="flex items-center gap-1 text-xs text-primary">
                  <Check className="h-3 w-3" /> Available on your primary Google Calendar
                </p>
              )}
          </div>
          {instant && (
            <div
              className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:grid-cols-2"
              aria-live="polite"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Your time · India
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {displayBookingTime(instant, HOME_ZONE)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Invitee · {zoneDef(leadZone).label}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {displayBookingTime(instant, leadZone)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Same appointment · {duration} minutes · daylight saving applied automatically
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="booking-email">Invitees</Label>
            <div className="flex flex-wrap gap-2">
              {emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex max-w-full items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-xs"
                >
                  <span className="truncate">{email}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${email}`}
                    onClick={() => setEmails(emails.filter((item) => item !== email))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                id="booking-email"
                placeholder="name@company.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmails();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addEmails}>
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add the business contact and teammates. All invitees receive a Google Calendar
              invitation.
            </p>
          </div>
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              Meeting details · location, Google Meet & notes
            </summary>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="booking-location">
                  Location <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="booking-location"
                  value={location}
                  maxLength={500}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Phone call, address, or meeting link"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addMeet}
                  onChange={(e) => setAddMeet(e.target.checked)}
                  className="accent-primary"
                />
                <Video className="h-4 w-4 text-muted-foreground" /> Add a Google Meet link
              </label>
              <div className="space-y-2">
                <Label htmlFor="booking-notes">
                  Notes{" "}
                  <span className="font-normal text-muted-foreground">(shared with invitees)</span>
                </Label>
                <Textarea
                  id="booking-notes"
                  value={notes}
                  maxLength={5000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What would you like to cover?"
                />
              </div>
            </div>
          </details>
        </fieldset>
        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}
        {!google.email && (
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <p>
              {google.configured
                ? "Connect Google Calendar to send this invitation."
                : "Calendar connection will be available once Google setup is complete."}
            </p>
            {google.error && <p className="mt-1 text-destructive">{google.error}</p>}
            {google.configured && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={!google.ready || google.connecting}
                onClick={google.connect}
              >
                {google.connecting ? "Connecting…" : "Connect Google Calendar"}
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            {duration} min · {emails.length} invited{google.email && ` · ${google.email}`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                sending ||
                !google.email ||
                !validTime ||
                busy ||
                availability.isFetching ||
                !availability.isSuccess
              }
            >
              {sending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}
