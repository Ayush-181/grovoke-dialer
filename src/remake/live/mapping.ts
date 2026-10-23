import {
  initialState,
  emptyLead,
  type State,
  type Lead,
  type Log,
  type Booking,
  type Session,
} from "../model";
import type { Tables, Json } from "../../integrations/supabase/types";
import { dialNumber } from "../numbers";
import { deriveLeadZone } from "../../lib/timezones";

export type WorkspaceData = {
  leads: Tables<"leads">[];
  logs: Tables<"dial_call_logs">[];
  bookings: Tables<"bookings">[];
  sessions: Tables<"calling_sessions">[];
  sessionLeads: Tables<"session_leads">[];
  document: { revision: number; data: Record<string, unknown> } | null;
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function mapLead(row: Tables<"leads">): Lead {
  const extra = object(object(row.metadata_json)["callboard"]);
  return {
    id: row.id,
    business: row.business_name,
    phone: row.phone_normalized || row.phone,
    category: String(extra["category"] ?? "Business"),
    city: row.city ?? "",
    zone: String(extra["zone"] ?? deriveLeadZone(row.state, row.phone_normalized).zone),
    contact: row.owner_name ?? "",
    role: String(extra["role"] ?? ""),
    direct: String(extra["direct"] ?? ""),
    email: row.email ?? "",
    website: row.website ?? "",
    notes: row.notes ?? "",
    outcome: row.outcome ?? "",
    calls: row.call_count,
    callback: Boolean(extra["callback"]),
    callbackAt: String(extra["callbackAt"] ?? ""),
    callbackReason: String(extra["callbackReason"] ?? ""),
    ...(typeof extra["callbackOccurrence"] === "number"
      ? { callbackOccurrence: extra["callbackOccurrence"] }
      : {}),
    triage: Boolean(extra["triage"]),
    offered: Boolean(extra["offered"]),
    ...(extra["talkingPoints"] ? { talkingPoints: String(extra["talkingPoints"]) } : {}),
    ...(Array.isArray(extra["contacts"])
      ? { contacts: extra["contacts"] as NonNullable<Lead["contacts"]> }
      : {}),
    ...(extra["customValues"]
      ? { customValues: extra["customValues"] as NonNullable<Lead["customValues"]> }
      : {}),
    ...(extra["stageId"] ? { stageId: String(extra["stageId"]) } : {}),
    ...(extra["suppressed"] ? { suppressed: true } : {}),
  };
}
export function stateFromWorkspace(
  rows: WorkspaceData,
  identity: { name: string; email: string; workspaceName: string; userId?: string },
): State {
  const defaults = initialState();
  const document = object(rows.document?.data);
  const settings = identity.userId
    ? object(object(document["userSettings"])[identity.userId])
    : document;
  const leadExtras = object(document["leadExtras"]);
  const leads = rows.leads.map(
    (row) => ({ ...mapLead(row), ...object(leadExtras[row.id]), id: row.id }) as Lead,
  );
  const logExtras = object(document["logExtras"]);
  const logs: Log[] = rows.logs.map(
    (row) =>
      ({
        id: row.id,
        leadId: row.lead_id ?? "",
        phone: row.phone,
        participants: [],
        at: row.called_at,
        seconds: row.duration_seconds,
        talkSeconds: row.duration_seconds,
        outcome: row.outcome ?? "",
        notes: row.notes ?? "",
        triage: row.triage_held,
        offered: row.appointment_offered,
        booked: row.outcome === "appointment_set",
        callback: row.outcome === "callback_requested",
        sessionId: row.session_id,
        ...object(logExtras[row.id]),
        recording: Boolean(row.recording_url) || object(logExtras[row.id])["recording"] === true,
      }) as Log,
  );
  const bookingExtras = object(document["bookingExtras"]);
  const bookings: Booking[] = rows.bookings.map(
    (row) =>
      ({
        id: row.id,
        leadId: row.lead_id ?? "",
        title: row.title,
        at: row.starts_at,
        zone: row.lead_timezone,
        duration: Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000),
        guests: row.attendees.join(", "),
        notes: row.notes,
        meet: row.add_meet,
        location: row.location,
        ...(row.google_event_url ? { googleEventUrl: row.google_event_url } : {}),
        ...(row.meet_url ? { meetUrl: row.meet_url } : {}),
        ...object(bookingExtras[row.id]),
      }) as Booking,
  );
  const sessionExtras = object(document["sessionExtras"]);
  const sessions: Session[] = rows.sessions.map(
    (row) =>
      ({
        id: row.id,
        name: row.name,
        leadIds: rows.sessionLeads
          .filter((item) => item.session_id === row.id)
          .sort((a, b) => a.queue_position - b.queue_position)
          .map((item) => item.lead_id),
        paused: row.status === "paused",
        status:
          row.status === "pending"
            ? "ready"
            : row.status === "completed"
              ? "stopped"
              : row.status === "active"
                ? "running"
                : "paused",
        elapsedMs: 0,
        startedAt: null,
        ...object(sessionExtras[row.id]),
      }) as Session,
  );
  // A saved running session resumes as paused. Browser/provider state is never resurrected on load.
  for (const session of sessions)
    if (session.status === "running") {
      session.status = "paused";
      session.paused = true;
      session.startedAt = null;
    }
  const blank = emptyLead();
  return {
    ...defaults,
    recordingEnabled: settings["recordingEnabled"] === true,
    preferences: {
      ...defaults.preferences,
      displayName: identity.name,
      email: identity.email,
      workspaceName: identity.workspaceName,
      ...object(settings["preferences"]),
    },
    leads,
    logs,
    bookings,
    sessions,
    selectedId: leads[0]?.id ?? "",
    draft: leads[0] ? { ...leads[0] } : blank,
    call: null,
    queueIds: leads.map((lead) => lead.id),
    queueComplete: false,
    activeSessionId: null,
    suppressedNumbers: Array.isArray(document["suppressedNumbers"])
      ? (document["suppressedNumbers"] as string[])
      : leads
          .filter((lead) => lead.suppressed || lead.outcome === "do_not_call")
          .flatMap((lead) => [lead.phone, lead.direct].filter(Boolean)),
    templates: Array.isArray(document["templates"])
      ? (document["templates"] as State["templates"])
      : defaults.templates,
    stages: Array.isArray(document["stages"])
      ? (document["stages"] as State["stages"])
      : defaults.stages,
    customFields: Array.isArray(document["customFields"])
      ? (document["customFields"] as State["customFields"])
      : defaults.customFields,
    followUps: Array.isArray(document["followUps"])
      ? (document["followUps"] as State["followUps"])
      : [],
    importBatches: Array.isArray(document["importBatches"])
      ? (document["importBatches"] as State["importBatches"])
      : [],
  };
}
export function durableMetadata(state: State): Record<string, unknown> {
  const index = <T extends { id: string }>(values: T[], pick: (value: T) => unknown) =>
    Object.fromEntries(values.map((value) => [value.id, pick(value)]));
  return {
    preferences: state.preferences,
    recordingEnabled: state.recordingEnabled,
    suppressedNumbers: state.suppressedNumbers,
    templates: state.templates,
    stages: state.stages,
    customFields: state.customFields,
    followUps: state.followUps,
    importBatches: state.importBatches,
    leadExtras: index(state.leads, (lead) => ({
      contacts: lead.contacts,
      customValues: lead.customValues,
      stageId: lead.stageId,
      suppressed: lead.suppressed,
      category: lead.category,
      zone: lead.zone,
      role: lead.role,
      direct: lead.direct,
      callback: lead.callback,
      callbackAt: lead.callbackAt,
      callbackReason: lead.callbackReason,
      callbackOccurrence: lead.callbackOccurrence,
      triage: lead.triage,
      offered: lead.offered,
      talkingPoints: lead.talkingPoints,
    })),
    logExtras: index(state.logs, (log) => ({
      seconds: log.seconds,
      participants: log.participants,
      booked: log.booked,
      callback: log.callback,
      recording: log.recording,
      heldSeconds: log.heldSeconds,
      talkSeconds: log.talkSeconds,
      ringingSeconds: log.ringingSeconds,
      bookingIds: log.bookingIds,
      answeredAt: log.answeredAt,
      endedAt: log.endedAt,
    })),
    bookingExtras: index(state.bookings, (booking) => ({
      originatingCallId: booking.originatingCallId,
    })),
    sessionExtras: index(state.sessions, (session) => ({
      elapsedMs:
        session.elapsedMs +
        (session.startedAt === null ? 0 : Math.max(0, Date.now() - session.startedAt)),
      startedAt: null,
    })),
  };
}
export function leadRow(lead: Lead, workspaceId: string): Record<string, unknown> {
  return {
    id: lead.id,
    workspace_id: workspaceId,
    business_name: lead.business,
    phone: lead.phone,
    phone_normalized: dialNumber(lead.phone) ?? lead.phone,
    city: lead.city || null,
    owner_name: lead.contact || null,
    email: lead.email || null,
    website: lead.website || null,
    notes: lead.notes || null,
    outcome: lead.outcome || null,
    metadata_json: {
      callboard: {
        contacts: lead.contacts ?? [],
        customValues: lead.customValues ?? {},
        stageId: lead.stageId ?? null,
        suppressed: lead.suppressed ?? false,
        category: lead.category,
        zone: lead.zone,
        role: lead.role,
        direct: lead.direct,
        callback: lead.callback,
        callbackAt: lead.callbackAt,
        callbackReason: lead.callbackReason,
        callbackOccurrence: lead.callbackOccurrence,
        triage: lead.triage,
        offered: lead.offered,
        talkingPoints: lead.talkingPoints ?? null,
      },
    } as Json,
  };
}
