import { dialNumber } from "./numbers";
import { OUTCOMES, type Outcome } from "../lib/outcomes";
import { bookingInstants } from "../lib/booking-time";
import {
  defaultStages,
  defaultTemplates,
  isSuppressed,
  isValidZone,
  leadPhones,
  validateCustomValues,
  validateDraft,
  type Contact,
  type CustomField,
  type CustomValue,
  type FollowUp,
  type ImportBatch,
  type PipelineStage,
  type ScriptTemplate,
} from "./domain";

export type Lead = {
  id: string;
  business: string;
  category: string;
  city: string;
  zone: string;
  phone: string;
  contact: string;
  role: string;
  direct: string;
  email: string;
  website: string;
  notes: string;
  talkingPoints?: string;
  contacts?: Contact[];
  customValues?: Record<string, CustomValue>;
  stageId?: string;
  suppressed?: boolean;
  callbackOccurrence?: number | undefined;
  outcome: Outcome | "";
  calls: number;
  callback: boolean;
  callbackAt: string;
  callbackReason: string;
  triage: boolean;
  offered: boolean;
};
export type Participant = { phone: string; name: string };
export type Call = {
  phone: string;
  at: string;
  id: string;
  leadId: string;
  active: boolean;
  seconds: number;
  phase: "connecting" | "connected" | "ended";
  answeredAt?: string;
  endedAt?: string;
  ringingSeconds: number;
  talkSeconds: number;
  callbackAtStart?: boolean;
  draftBaseline?: Lead;
  lastTickAt?: number;
  muted: boolean;
  held: boolean;
  heldSeconds: number;
  recording: boolean;
  participants: Participant[];
  digits: string;
};
export type Log = {
  heldSeconds?: number;
  talkSeconds?: number;
  ringingSeconds?: number;
  answeredAt?: string;
  endedAt?: string;
  bookingIds?: string[];
  phone: string;
  participants: Participant[];
  triage: boolean;
  offered: boolean;
  booked: boolean;
  callback: boolean;
  sessionId: string | null;
  id: string;
  leadId: string;
  at: string;
  seconds: number;
  outcome: Outcome | "";
  notes: string;
  recording: boolean;
};
export type Booking = {
  location?: string;
  googleEventUrl?: string;
  meetUrl?: string;
  originatingCallId?: string;
  id: string;
  leadId: string;
  title: string;
  at: string;
  zone: string;
  duration: number;
  guests: string;
  notes: string;
  meet: boolean;
};
export type Session = {
  id: string;
  name: string;
  leadIds: string[];
  paused: boolean;
  status: "ready" | "running" | "paused" | "stopped";
  elapsedMs: number;
  startedAt: number | null;
};
export type State = {
  preferences: { workspaceName: string; displayName: string; email: string; microphone: string };
  leads: Lead[];
  selectedId: string;
  draft: Lead;
  call: Call | null;
  recordingEnabled: boolean;
  logs: Log[];
  bookings: Booking[];
  sessions: Session[];
  queueIds: string[];
  queueComplete: boolean;
  activeSessionId: string | null;
  templates: ScriptTemplate[];
  stages: PipelineStage[];
  customFields: CustomField[];
  followUps: FollowUp[];
  importBatches: ImportBatch[];
  suppressedNumbers: string[];
};
export const zones = [
  { value: "America/New_York", label: "Eastern · ET" },
  { value: "America/Chicago", label: "Central · CT" },
  { value: "America/Denver", label: "Mountain · MT" },
  { value: "America/Los_Angeles", label: "Pacific · PT" },
  { value: "America/Phoenix", label: "Arizona · MST" },
  { value: "Asia/Kolkata", label: "India · IST" },
];

export function initialState(): State {
  const businesses = [
    ["Harborline Rentals", "Boat rental", "New York, NY", "America/New_York", "Jordan Lee"],
    ["Maple Street Studio", "Interior design", "Chicago, IL", "America/Chicago", "Taylor Kim"],
    ["Pine Works", "Landscaping", "Denver, CO", "America/Denver", "Riley Chen"],
    ["Ironwood Roofing", "Roofing", "Phoenix, AZ", "America/Phoenix", "Morgan West"],
    ["Coastline Auto Care", "Auto repair", "San Diego, CA", "America/Los_Angeles", "Alex Rivera"],
    ["Cedar & Stone", "Construction", "Austin, TX", "America/Chicago", "Sam Parker"],
    ["Juniper Dental", "Dental clinic", "Boston, MA", "America/New_York", "Jamie Ellis"],
    ["Northstar Electric", "Electrical", "Seattle, WA", "America/Los_Angeles", "Casey Brooks"],
  ];
  const leads = businesses.map((row, index): Lead => ({
    id: `demo-${index}`,
    business: row[0]!,
    category: row[1]!,
    city: row[2]!,
    zone: row[3]!,
    phone: `+1212555010${index}`,
    contact: row[4]!,
    role: "Owner",
    direct: "",
    email: `contact${index}@example.invalid`,
    website: "example.invalid",
    notes:
      index === 0
        ? "Independent rental business. Ask about their weekend booking process.\nInterested in reducing missed enquiries."
        : "",
    outcome:
      index === 1
        ? "connected_gk"
        : index === 4
          ? "callback_requested"
          : index === 6
            ? "do_not_call"
            : "",
    calls: [1, 4, 6].includes(index) ? 1 : 0,
    callback: index === 4,
    callbackAt: "",
    callbackReason: index === 4 ? "Owner is available after lunch." : "",
    triage: index === 1,
    offered: false,
    suppressed: index === 6,
    stageId: index === 6 ? "dnc" : index === 4 ? "callback" : index === 1 ? "contacted" : "new",
    contacts: [
      {
        id: `contact-${index}`,
        name: row[4]!,
        role: "Owner",
        phone: `+1212555010${index}`,
        email: `contact${index}@example.invalid`,
      },
    ],
    customValues: {},
  }));
  return {
    preferences: {
      workspaceName: "Grovoke workspace",
      displayName: "Ash",
      email: "ash@example.invalid",
      microphone: "default",
    },
    leads,
    selectedId: leads[0]!.id,
    draft: { ...leads[0]! },
    call: null,
    recordingEnabled: false,
    logs: [1, 4, 6].map((i) => ({
      id: `history-${i}`,
      phone: leads[i]!.phone,
      participants: [],
      leadId: leads[i]!.id,
      at: new Date(Date.now() - (i === 4 ? 86_400_000 : 0)).toISOString(),
      seconds: i === 6 ? 45 : 134,
      outcome: leads[i]!.outcome,
      notes: i === 4 ? "Try again after lunch." : "",
      recording: false,
      triage: i === 1,
      offered: false,
      booked: false,
      callback: i === 4,
      sessionId: null,
    })),
    bookings: [
      {
        id: "booking-demo",
        leadId: leads[2]!.id,
        title: "Ash x Pine Works",
        at: "2026-10-12T17:00:00Z",
        zone: "America/Denver",
        duration: 30,
        guests: "contact2@example.invalid",
        notes: "Discuss their lead follow-up process.",
        meet: true,
      },
    ],
    sessions: [
      {
        id: "session-demo",
        name: "Local businesses · First touch",
        leadIds: leads.filter((l) => !l.outcome).map((l) => l.id),
        paused: false,
        status: "ready",
        elapsedMs: 0,
        startedAt: null,
      },
    ],
    queueIds: leads.map((l) => l.id),
    queueComplete: false,
    activeSessionId: null,
    templates: defaultTemplates(),
    stages: defaultStages(),
    customFields: [],
    followUps: [],
    importBatches: [],
    suppressedNumbers: leads.filter(isSuppressed).flatMap(leadPhones),
  };
}

export function emptyLead(): Lead {
  return {
    id: "",
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
    stageId: "new",
    suppressed: false,
  };
}
export type DataSnapshot = Pick<
  State,
  | "leads"
  | "logs"
  | "bookings"
  | "sessions"
  | "templates"
  | "stages"
  | "customFields"
  | "followUps"
  | "importBatches"
  | "suppressedNumbers"
  | "preferences"
  | "recordingEnabled"
>;
export function isDirty(state: State): boolean {
  const baseline = state.call?.leadId === state.selectedId ? state.call.draftBaseline : undefined;
  return (
    JSON.stringify(state.draft) !==
    JSON.stringify(
      baseline ?? state.leads.find((lead) => lead.id === state.selectedId) ?? emptyLead(),
    )
  );
}
export type Action =
  | { type: "edit"; patch: Partial<Lead> }
  | { type: "select"; id: string }
  | { type: "discard" }
  | { type: "save"; next?: boolean; now?: number }
  | { type: "dial"; id: string; at?: string; phone?: string; phase?: "connecting" | "connected" }
  | {
      type: "manualDial";
      id: string;
      leadId: string;
      phone: string;
      name: string;
      at: string;
      phase?: "connecting" | "connected";
    }
  | { type: "answer"; id?: string; at?: string }
  | { type: "end"; at: string }
  | { type: "tick"; now?: number }
  | {
      type: "providerTime";
      id?: string;
      seconds: number;
      talkSeconds?: number;
      heldSeconds?: number;
    }
  | { type: "mute" }
  | { type: "hold" }
  | { type: "digit"; value: string }
  | { type: "participant"; phone: string; name?: string; remove?: boolean }
  | { type: "recording"; enabled: boolean }
  | { type: "booking"; booking: Booking }
  | { type: "deleteBooking"; id: string }
  | { type: "session"; session: Session }
  | { type: "startSession"; id: string; now: number }
  | { type: "setSessionStatus"; id: string; status: "paused" | "stopped"; now: number }
  | { type: "milestone"; kind: "triage" | "offered" | "booked"; enabled: boolean }
  | {
      type: "import";
      leads: Lead[];
      mode?: "insert_only" | "fill_blanks";
      skipped?: number;
      id?: string;
      at?: string;
    }
  | { type: "configuration"; patch: Partial<Pick<State, "templates" | "stages" | "customFields">> }
  | { type: "followUp"; followUp: FollowUp; now?: number }
  | { type: "followUpStatus"; id: string; status: FollowUp["status"] }
  | { type: "addLead"; lead: Lead }
  | { type: "updateLead"; lead: Lead; now?: number }
  | { type: "restoreData"; data: DataSnapshot }
  | { type: "deleteLeads"; ids: string[] }
  | { type: "preferences"; patch: Partial<State["preferences"]> }
  | { type: "queue"; ids: string[] };

function validIds(items: { id: string }[]): boolean {
  return (
    items.every((item) => item && typeof item.id === "string" && item.id.length > 0) &&
    new Set(items.map((item) => item.id)).size === items.length
  );
}
function blockedNumber(state: State, phone: string): boolean {
  return (
    state.suppressedNumbers.includes(phone) ||
    state.leads.some((lead) => isSuppressed(lead) && leadPhones(lead).includes(phone))
  );
}
function sessionBlocked(state: State): boolean {
  return Boolean(
    state.activeSessionId &&
    state.sessions.find((item) => item.id === state.activeSessionId)?.status !== "running",
  );
}
function stageFor(state: State, lead: Lead): string {
  const stored = state.leads.find((item) => item.id === lead.id);
  const explicitStage = state.stages.find((stage) => stage.id === lead.stageId)?.id;
  if (explicitStage && lead.stageId !== stored?.stageId) return explicitStage;
  return (
    (lead.outcome !== stored?.outcome
      ? state.stages.find((stage) => stage.outcomes.includes(lead.outcome))?.id
      : undefined) ??
    explicitStage ??
    state.stages[0]?.id ??
    "new"
  );
}
function linkedBooking(state: State): boolean {
  return Boolean(state.logs.find((log) => log.id === state.call?.id)?.bookingIds?.length);
}
function saveLead(state: State, draft: Lead): Lead {
  const stored = state.leads.find((lead) => lead.id === draft.id);
  return {
    ...draft,
    suppressed: Boolean(stored?.suppressed || draft.suppressed || draft.outcome === "do_not_call"),
    stageId: stageFor(state, draft),
  };
}
function scheduleFromDraft(state: State, draft: Lead, previous?: Lead): FollowUp[] {
  if (
    draft.callbackAt === previous?.callbackAt &&
    draft.zone === previous?.zone &&
    draft.callbackOccurrence === previous?.callbackOccurrence &&
    draft.callbackReason === previous?.callbackReason
  )
    return state.followUps;
  const id = `followup-${draft.id}`;
  if (
    !draft.callbackAt ||
    isSuppressed(draft) ||
    state.stages.find((stage) => stage.id === draft.stageId)?.noFollowUps
  ) {
    return state.followUps.map((item) =>
      item.id === id && item.status === "pending" ? { ...item, status: "cancelled" } : item,
    );
  }
  const instant = bookingInstants(draft.callbackAt, draft.zone)[draft.callbackOccurrence ?? 0];
  if (!instant) return state.followUps;
  const followUp: FollowUp = {
    id,
    leadId: draft.id,
    at: instant.toISOString(),
    zone: draft.zone,
    reason: draft.callbackReason.trim(),
    status: "pending",
  };
  return [...state.followUps.filter((item) => item.id !== id), followUp];
}
function validConfiguration(
  patch: Partial<Pick<State, "templates" | "stages" | "customFields">>,
): boolean {
  if (
    patch.templates &&
    (!Array.isArray(patch.templates) ||
      !validIds(patch.templates) ||
      patch.templates.some(
        (item) =>
          typeof item.name !== "string" ||
          !item.name.trim() ||
          typeof item.body !== "string" ||
          !item.body.trim() ||
          !["opener", "gatekeeper", "voicemail"].includes(item.kind),
      ))
  )
    return false;
  if (
    patch.customFields &&
    (!Array.isArray(patch.customFields) ||
      !validIds(patch.customFields) ||
      patch.customFields.some(
        (item) =>
          typeof item.label !== "string" ||
          !item.label.trim() ||
          typeof item.showInTable !== "boolean" ||
          !["text", "number", "date", "select", "checkbox", "url"].includes(item.type) ||
          !Array.isArray(item.options) ||
          item.options.some((option) => typeof option !== "string") ||
          (item.type === "select" &&
            (!item.options.length || new Set(item.options).size !== item.options.length)),
      ))
  )
    return false;
  if (patch.stages) {
    if (
      !Array.isArray(patch.stages) ||
      !patch.stages.length ||
      !validIds(patch.stages) ||
      patch.stages.some(
        (stage) =>
          typeof stage.label !== "string" ||
          !stage.label.trim() ||
          typeof stage.terminal !== "boolean" ||
          typeof stage.noFollowUps !== "boolean" ||
          !Array.isArray(stage.outcomes),
      )
    )
      return false;
    const mapped = patch.stages.flatMap((stage) => stage.outcomes);
    if (
      mapped.some((outcome) => !OUTCOMES.some((item) => item.value === outcome)) ||
      new Set(mapped).size !== mapped.length
    )
      return false;
  }
  return true;
}
// Pure state adapter: no networking, provider SDK, microphone or database side effects.
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "edit": {
      const patch = { ...action.patch };
      if (state.draft.suppressed) patch.suppressed = true;
      if (linkedBooking(state) && patch.outcome && patch.outcome !== "appointment_set")
        patch.outcome = "appointment_set";
      return { ...state, draft: { ...state.draft, ...patch } };
    }
    case "select": {
      if (state.call?.active || isDirty(state)) return state;
      const lead = state.leads.find((item) => item.id === action.id);
      return lead
        ? {
            ...state,
            selectedId: lead.id,
            draft: { ...lead },
            call: state.call?.leadId === lead.id ? state.call : null,
            queueComplete: false,
          }
        : state;
    }
    case "discard": {
      const draft = {
        ...(state.leads.find((lead) => lead.id === state.selectedId) ?? emptyLead()),
      };
      return { ...state, draft, call: state.call ? { ...state.call, draftBaseline: draft } : null };
    }
    case "save": {
      if (state.call?.active || !state.selectedId) return state;
      const previous = state.leads.find((lead) => lead.id === state.selectedId);
      if (
        validateDraft(state.draft, action.now, previous) ||
        validateCustomValues(state.customFields, state.draft.customValues)
      )
        return state;
      const draft = saveLead(state, {
        ...state.draft,
        ...(linkedBooking(state) ? { outcome: "appointment_set" as const } : {}),
      });
      if (
        leadPhones(draft).some((phone) =>
          state.leads.some((lead) => lead.id !== draft.id && leadPhones(lead).includes(phone)),
        )
      )
        return state;
      const leads = state.leads.map((lead) => (lead.id === state.selectedId ? draft : lead));
      const logs = state.logs.map((log) =>
        log.id === state.call?.id && log.leadId === state.selectedId
          ? {
              ...log,
              outcome: draft.outcome,
              notes: draft.notes,
              callback:
                draft.outcome === "callback_requested" ||
                (draft.callback && !state.call?.callbackAtStart),
              triage: draft.triage,
              offered: draft.offered,
            }
          : log,
      );
      const index = state.queueIds.indexOf(state.selectedId);
      const next =
        action.next && index >= 0
          ? leads.find((lead) => lead.id === state.queueIds[index + 1])
          : undefined;
      let followUps = scheduleFromDraft(state, draft, previous);
      if (
        isSuppressed(draft) ||
        state.stages.find((stage) => stage.id === draft.stageId)?.noFollowUps
      )
        followUps = followUps.map((item) =>
          item.leadId === draft.id && item.status === "pending"
            ? { ...item, status: "cancelled" }
            : item,
        );
      return {
        ...state,
        leads,
        logs,
        followUps,
        suppressedNumbers: [
          ...new Set([
            ...state.suppressedNumbers,
            ...(isSuppressed(draft) ? leadPhones(draft) : []),
          ]),
        ],
        draft,
        call: state.call ? { ...state.call, draftBaseline: draft } : null,
        ...(next ? { selectedId: next.id, draft: { ...next }, call: null } : {}),
        queueComplete: Boolean(action.next && !next),
      };
    }
    case "manualDial": {
      const phone = dialNumber(action.phone);
      if (
        !action.id.trim() ||
        !action.leadId.trim() ||
        !phone ||
        state.call?.active ||
        isDirty(state) ||
        sessionBlocked(state) ||
        blockedNumber(state, phone) ||
        state.logs.some((log) => log.id === action.id)
      )
        return state;
      const existing = state.leads.find((lead) => leadPhones(lead).includes(phone));
      if (!existing && state.leads.some((lead) => lead.id === action.leadId)) return state;
      const lead: Lead = existing ?? {
        ...emptyLead(),
        id: action.leadId,
        business: action.name.trim() || `Manual number ${phone}`,
        category: "Manual call",
        city: "Location not set",
        zone: state.draft.zone,
        phone,
        contact: action.name.trim(),
      };
      const next = {
        ...state,
        leads: existing ? state.leads : [...state.leads, lead],
        selectedId: lead.id,
        draft: { ...lead },
        call: null,
        queueIds: state.queueIds.includes(lead.id) ? state.queueIds : [...state.queueIds, lead.id],
        queueComplete: false,
      };
      return reducer(next, {
        type: "dial",
        id: action.id,
        phone,
        at: action.at,
        ...(action.phase ? { phase: action.phase } : {}),
      });
    }
    case "dial": {
      const phone = dialNumber(action.phone ?? state.draft.phone);
      const saved = state.leads.find((lead) => lead.id === state.selectedId);
      if (
        !action.id.trim() ||
        !phone ||
        !saved ||
        blockedNumber(state, phone) ||
        isSuppressed(state.draft) ||
        isSuppressed(saved) ||
        state.call?.active ||
        sessionBlocked(state) ||
        state.logs.some((log) => log.id === action.id)
      )
        return state;
      const at = action.at ?? new Date().toISOString();
      if (!Number.isFinite(Date.parse(at))) return state;
      const phase = action.phase ?? "connected";
      const draft: Lead = {
        ...state.draft,
        calls: state.draft.calls + 1,
        outcome: "",
        notes: state.draft.notes !== saved.notes ? state.draft.notes : "",
        triage: false,
        offered: false,
      };
      return {
        ...state,
        leads: state.leads.map((lead) =>
          lead.id === state.selectedId ? { ...lead, calls: lead.calls + 1 } : lead,
        ),
        draft,
        logs: [
          {
            id: action.id,
            phone,
            participants: [],
            leadId: state.selectedId,
            at,
            seconds: 0,
            talkSeconds: 0,
            ringingSeconds: 0,
            heldSeconds: 0,
            ...(phase === "connected" ? { answeredAt: at } : {}),
            outcome: "",
            notes: "",
            recording: state.recordingEnabled,
            triage: false,
            offered: false,
            booked: false,
            callback: false,
            sessionId: state.activeSessionId,
            bookingIds: [],
          },
          ...state.logs,
        ],
        call: {
          phone,
          at,
          id: action.id,
          leadId: state.selectedId,
          active: true,
          seconds: 0,
          phase,
          ...(phase === "connected" ? { answeredAt: at } : {}),
          talkSeconds: 0,
          ringingSeconds: 0,
          lastTickAt: Date.parse(at),
          muted: false,
          held: false,
          heldSeconds: 0,
          recording: state.recordingEnabled,
          participants: [],
          digits: "",
          draftBaseline: draft,
          callbackAtStart: saved.callback,
        },
      };
    }
    case "answer": {
      if (
        !state.call?.active ||
        state.call.phase !== "connecting" ||
        (action.id && action.id !== state.call.id)
      )
        return state;
      const at = action.at ?? new Date().toISOString();
      if (!Number.isFinite(Date.parse(at))) return state;
      return {
        ...state,
        call: { ...state.call, phase: "connected", answeredAt: at },
        logs: state.logs.map((log) =>
          log.id === state.call?.id ? { ...log, answeredAt: at } : log,
        ),
      };
    }
    case "end": {
      if (!state.call?.active) return state;
      return {
        ...state,
        call: { ...state.call, active: false, phase: "ended", held: false, endedAt: action.at },
        logs: state.logs.map((log) =>
          log.id === state.call?.id
            ? {
                ...log,
                seconds: state.call!.seconds,
                talkSeconds: state.call!.talkSeconds,
                heldSeconds: state.call!.heldSeconds,
                ringingSeconds: state.call!.ringingSeconds,
                endedAt: action.at,
              }
            : log,
        ),
      };
    }
    case "tick": {
      if (!state.call?.active) return state;
      const elapsed =
        action.now === undefined
          ? 1
          : Math.max(0, Math.floor((action.now - (state.call.lastTickAt ?? action.now)) / 1000));
      if (!elapsed) return state;
      const call = {
        ...state.call,
        seconds: state.call.seconds + elapsed,
        heldSeconds: state.call.heldSeconds + (state.call.held ? elapsed : 0),
        talkSeconds:
          state.call.talkSeconds +
          (state.call.phase === "connected" && !state.call.held ? elapsed : 0),
        ringingSeconds:
          state.call.ringingSeconds + (state.call.phase === "connecting" ? elapsed : 0),
        lastTickAt: (state.call.lastTickAt ?? Date.now()) + elapsed * 1000,
      };
      return {
        ...state,
        call,
        logs: state.logs.map((log) =>
          log.id === call.id
            ? {
                ...log,
                seconds: call.seconds,
                heldSeconds: call.heldSeconds,
                talkSeconds: call.talkSeconds,
                ringingSeconds: call.ringingSeconds,
              }
            : log,
        ),
      };
    }
    case "providerTime": {
      if (
        !state.call?.active ||
        (action.id && action.id !== state.call.id) ||
        !Number.isFinite(action.seconds)
      )
        return state;
      const seconds = Math.max(state.call.seconds, Math.floor(action.seconds), 0);
      const heldSeconds = Math.min(
        seconds,
        Math.max(0, Math.floor(action.heldSeconds ?? state.call.heldSeconds)),
      );
      const measuredTalk =
        action.talkSeconds ??
        (state.call.phase === "connected"
          ? seconds - state.call.ringingSeconds - heldSeconds
          : state.call.talkSeconds);
      if (!Number.isFinite(measuredTalk) || !Number.isFinite(heldSeconds)) return state;
      const talkSeconds = Math.min(seconds - heldSeconds, Math.max(0, Math.floor(measuredTalk)));
      const ringingSeconds = Math.max(0, seconds - talkSeconds - heldSeconds);
      const call = { ...state.call, seconds, talkSeconds, heldSeconds, ringingSeconds };
      return {
        ...state,
        call,
        logs: state.logs.map((log) =>
          log.id === call.id ? { ...log, seconds, talkSeconds, heldSeconds, ringingSeconds } : log,
        ),
      };
    }
    case "mute":
      return state.call?.active
        ? { ...state, call: { ...state.call, muted: !state.call.muted } }
        : state;
    case "hold":
      return state.call?.active && state.call.phase === "connected"
        ? { ...state, call: { ...state.call, held: !state.call.held } }
        : state;
    case "digit":
      return state.call?.active && !state.call.held && /^[0-9*#]$/.test(action.value)
        ? {
            ...state,
            call: { ...state.call, digits: `${state.call.digits}${action.value}`.slice(-32) },
          }
        : state;
    case "participant": {
      const phone = dialNumber(action.phone);
      if (
        !state.call?.active ||
        !phone ||
        (!action.remove &&
          (state.call.phase !== "connected" ||
            state.call.held ||
            blockedNumber(state, phone) ||
            phone === state.call.phone ||
            state.call.participants.some((person) => person.phone === phone)))
      )
        return state;
      const participants = action.remove
        ? state.call.participants.filter((person) => person.phone !== phone)
        : [...state.call.participants, { phone, name: action.name?.trim() || phone }];
      return {
        ...state,
        call: { ...state.call, participants },
        logs: state.logs.map((log) =>
          log.id === state.call?.id
            ? {
                ...log,
                participants:
                  action.remove || log.participants.some((person) => person.phone === phone)
                    ? log.participants
                    : [...log.participants, { phone, name: action.name?.trim() || phone }],
              }
            : log,
        ),
      };
    }
    case "recording":
      return { ...state, recordingEnabled: action.enabled };
    case "preferences":
      return { ...state, preferences: { ...state.preferences, ...action.patch } };
    case "booking": {
      if (
        state.bookings.some((booking) => booking.id === action.booking.id) ||
        !state.leads.some((lead) => lead.id === action.booking.leadId) ||
        !Number.isFinite(Date.parse(action.booking.at)) ||
        !isValidZone(action.booking.zone) ||
        !Number.isFinite(action.booking.duration) ||
        action.booking.duration <= 0
      )
        return state;
      const inferredCall =
        state.call?.leadId === action.booking.leadId && state.call.answeredAt
          ? state.call.id
          : undefined;
      const originatingCallId = action.booking.originatingCallId ?? inferredCall;
      const linked = state.logs.find(
        (log) => log.id === originatingCallId && log.leadId === action.booking.leadId,
      );
      const booking = { ...action.booking };
      if (linked) booking.originatingCallId = linked.id;
      else delete booking.originatingCallId;
      return {
        ...state,
        ...(linked && state.call?.id === linked.id && state.selectedId === linked.leadId
          ? { draft: { ...state.draft, outcome: "appointment_set" as const } }
          : {}),
        bookings: [...state.bookings, booking],
        logs: state.logs.map((log) =>
          log.id === linked?.id
            ? {
                ...log,
                booked: true,
                outcome: "appointment_set",
                bookingIds: [...new Set([...(log.bookingIds ?? []), booking.id])],
              }
            : log,
        ),
      };
    }
    case "deleteBooking":
      return { ...state, bookings: state.bookings.filter((booking) => booking.id !== action.id) };
    case "session":
      return validIds([action.session]) &&
        !state.sessions.some((session) => session.id === action.session.id)
        ? {
            ...state,
            sessions: [
              ...state.sessions,
              {
                ...action.session,
                leadIds: [...new Set(action.session.leadIds)].filter((id) =>
                  state.leads.some((lead) => lead.id === id),
                ),
                startedAt: null,
                status: "ready",
                paused: false,
              },
            ],
          }
        : state;
    case "milestone": {
      if (
        !state.call ||
        !state.call.answeredAt ||
        state.call.leadId !== state.selectedId ||
        (action.kind === "booked" && !action.enabled && linkedBooking(state))
      )
        return state;
      const outcome =
        action.kind === "booked"
          ? action.enabled
            ? "appointment_set"
            : state.draft.outcome === "appointment_set"
              ? ""
              : state.draft.outcome
          : state.draft.outcome;
      return {
        ...state,
        draft: {
          ...state.draft,
          outcome,
          ...(action.kind === "triage"
            ? { triage: action.enabled }
            : action.kind === "offered"
              ? { offered: action.enabled }
              : {}),
        },
        logs: state.logs.map((log) =>
          log.id === state.call?.id
            ? {
                ...log,
                [action.kind]: action.enabled,
                ...(action.kind === "booked"
                  ? {
                      outcome: action.enabled
                        ? "appointment_set"
                        : log.outcome === "appointment_set"
                          ? ""
                          : log.outcome,
                    }
                  : {}),
              }
            : log,
        ),
      };
    }
    case "startSession": {
      const session = state.sessions.find((item) => item.id === action.id);
      if (
        !session ||
        state.call?.active ||
        (isDirty(state) && state.activeSessionId !== session.id) ||
        (state.activeSessionId && state.activeSessionId !== session.id)
      )
        return state;
      const ids = [...new Set(session.leadIds)].filter((id) =>
        state.leads.some((lead) => lead.id === id),
      );
      const lead = state.leads.find((item) => item.id === ids[0]);
      if (!lead) return state;
      const alreadyOpen = state.activeSessionId === session.id;
      return {
        ...state,
        activeSessionId: session.id,
        queueIds: ids,
        queueComplete: false,
        ...(alreadyOpen ? {} : { selectedId: lead.id, draft: { ...lead }, call: null }),
        sessions: state.sessions.map((item) =>
          item.id === session.id && item.status !== "running"
            ? {
                ...item,
                paused: false,
                status: "running",
                elapsedMs: item.status === "stopped" ? 0 : item.elapsedMs,
                startedAt: action.now,
              }
            : item,
        ),
      };
    }
    case "setSessionStatus": {
      const session = state.sessions.find((item) => item.id === action.id);
      if (
        !session ||
        (action.status === "paused" && (state.call?.active || state.activeSessionId !== action.id))
      )
        return state;
      const stopped = action.status === "stopped" && state.activeSessionId === action.id;
      const next =
        stopped && state.call?.active
          ? reducer(state, { type: "end", at: new Date(action.now).toISOString() })
          : state;
      return {
        ...next,
        activeSessionId: stopped ? null : state.activeSessionId,
        sessions: next.sessions.map((item) =>
          item.id === action.id
            ? {
                ...item,
                status: action.status,
                paused: action.status === "paused",
                elapsedMs:
                  item.elapsedMs +
                  (item.startedAt === null ? 0 : Math.max(0, action.now - item.startedAt)),
                startedAt: null,
              }
            : item,
        ),
      };
    }
    case "addLead":
      return reducer(state, { type: "import", leads: [action.lead] });
    case "updateLead": {
      const existing = state.leads.find((lead) => lead.id === action.lead.id);
      if (
        !existing ||
        isDirty(state) ||
        (state.call?.active && state.call.leadId === existing.id) ||
        validateDraft(action.lead, action.now, existing) ||
        validateCustomValues(state.customFields, action.lead.customValues)
      )
        return state;
      const lead = saveLead(state, action.lead);
      const conflicts = leadPhones(lead).some((phone) =>
        state.leads.some((item) => item.id !== lead.id && leadPhones(item).includes(phone)),
      );
      if (conflicts) return state;
      return {
        ...state,
        leads: state.leads.map((item) => (item.id === lead.id ? lead : item)),
        ...(state.selectedId === lead.id
          ? { draft: { ...lead }, call: state.call ? { ...state.call, draftBaseline: lead } : null }
          : {}),
        followUps:
          isSuppressed(lead) || state.stages.find((stage) => stage.id === lead.stageId)?.noFollowUps
            ? state.followUps.map((item) =>
                item.leadId === lead.id && item.status === "pending"
                  ? { ...item, status: "cancelled" }
                  : item,
              )
            : scheduleFromDraft(state, lead, existing),
        suppressedNumbers: [
          ...new Set([...state.suppressedNumbers, ...(isSuppressed(lead) ? leadPhones(lead) : [])]),
        ],
      };
    }
    case "import": {
      if (
        state.call?.active ||
        isDirty(state) ||
        (action.id && state.importBatches.some((batch) => batch.id === action.id))
      )
        return state;
      const leads = [...state.leads];
      let added = 0,
        updated = 0,
        skipped = Number.isFinite(action.skipped)
          ? Math.max(0, Math.floor(action.skipped ?? 0))
          : 0;
      for (const incoming of action.leads) {
        const phones = leadPhones(incoming);
        if (
          !incoming.id ||
          validateDraft(incoming, Date.now(), incoming) ||
          validateCustomValues(state.customFields, incoming.customValues) ||
          phones.some((phone) => blockedNumber(state, phone))
        ) {
          skipped++;
          continue;
        }
        const matches = leads.filter(
          (lead) =>
            lead.id === incoming.id || phones.some((phone) => leadPhones(lead).includes(phone)),
        );
        if (matches.length) {
          const existing = matches[0]!;
          if (action.mode !== "fill_blanks" || matches.length !== 1 || isSuppressed(existing)) {
            skipped++;
            continue;
          }
          const merged = { ...existing };
          const keys: (keyof Lead)[] = [
            "business",
            "category",
            "city",
            "zone",
            "phone",
            "contact",
            "role",
            "direct",
            "email",
            "website",
            "notes",
            "talkingPoints",
            "callbackReason",
          ];
          for (const key of keys)
            if (
              (merged[key] === "" || merged[key] === undefined) &&
              incoming[key] !== "" &&
              incoming[key] !== undefined
            )
              (merged as unknown as Record<string, unknown>)[key] = incoming[key];
          merged.customValues = { ...(existing.customValues ?? {}) };
          for (const [key, value] of Object.entries(incoming.customValues ?? {}))
            if (
              merged.customValues[key] === undefined ||
              merged.customValues[key] === null ||
              merged.customValues[key] === ""
            )
              merged.customValues[key] = value;
          const contactIds = new Set((existing.contacts ?? []).map((item) => item.id));
          const contactPhones = new Set(
            (existing.contacts ?? []).map((item) => dialNumber(item.phone)).filter(Boolean),
          );
          merged.contacts = [
            ...(existing.contacts ?? []),
            ...(incoming.contacts ?? []).filter((contact) => {
              const phone = dialNumber(contact.phone);
              if (contactIds.has(contact.id) || (phone && contactPhones.has(phone))) return false;
              contactIds.add(contact.id);
              if (phone) contactPhones.add(phone);
              return true;
            }),
          ];
          if (JSON.stringify(merged) === JSON.stringify(existing)) {
            skipped++;
            continue;
          }
          leads[leads.indexOf(existing)] = merged;
          updated++;
        } else {
          leads.push({
            ...incoming,
            calls: 0,
            suppressed: isSuppressed(incoming),
            customValues: { ...(incoming.customValues ?? {}) },
            contacts: [...(incoming.contacts ?? [])],
          });
          added++;
        }
      }
      const selected =
        leads.find((lead) => lead.id === state.selectedId) ?? leads[0] ?? emptyLead();
      const at = action.at ?? new Date().toISOString();
      return {
        ...state,
        leads,
        selectedId: selected.id,
        draft: { ...selected },
        call:
          state.call?.leadId === selected.id ? { ...state.call, draftBaseline: selected } : null,
        queueIds: [
          ...new Set([
            ...state.queueIds,
            ...leads
              .filter((lead) => !state.leads.some((item) => item.id === lead.id))
              .map((lead) => lead.id),
          ]),
        ],
        importBatches: [
          ...state.importBatches,
          {
            id: action.id ?? `import-${at}-${state.importBatches.length}`,
            at,
            added,
            updated,
            skipped,
          },
        ],
        suppressedNumbers: [
          ...new Set([
            ...state.suppressedNumbers,
            ...leads.filter(isSuppressed).flatMap(leadPhones),
          ]),
        ],
      };
    }
    case "configuration": {
      if (!validConfiguration(action.patch)) return state;
      const stages = action.patch.stages ?? state.stages;
      const fix = (lead: Lead) =>
        lead.stageId && !stages.some((stage) => stage.id === lead.stageId)
          ? { ...lead, stageId: stages[0]?.id ?? "new" }
          : lead;
      const leads = state.leads.map(fix);
      return {
        ...state,
        ...action.patch,
        leads,
        draft: fix(state.draft),
        followUps: state.followUps.map((followUp) => {
          const lead = leads.find((item) => item.id === followUp.leadId);
          return followUp.status === "pending" &&
            lead &&
            (isSuppressed(lead) || stages.find((stage) => stage.id === lead.stageId)?.noFollowUps)
            ? { ...followUp, status: "cancelled" }
            : followUp;
        }),
      };
    }
    case "followUp": {
      const followUp = action.followUp;
      const lead = state.leads.find((item) => item.id === followUp.leadId);
      const existing = state.followUps.find((item) => item.id === followUp.id);
      if (
        !followUp.id ||
        (existing && existing.leadId !== followUp.leadId) ||
        !lead ||
        isSuppressed(lead) ||
        state.stages.find((stage) => stage.id === lead.stageId)?.noFollowUps ||
        !isValidZone(followUp.zone) ||
        !Number.isFinite(Date.parse(followUp.at)) ||
        Date.parse(followUp.at) <= (action.now ?? Date.now()) ||
        followUp.status !== "pending" ||
        (followUp.contactId && !lead.contacts?.some((contact) => contact.id === followUp.contactId))
      )
        return state;
      return {
        ...state,
        followUps: [
          ...state.followUps.filter((item) => item.id !== followUp.id),
          { ...followUp, reason: followUp.reason.trim() },
        ],
      };
    }
    case "followUpStatus": {
      if (!["pending", "completed", "cancelled"].includes(action.status)) return state;
      const followUp = state.followUps.find((item) => item.id === action.id);
      if (!followUp) return state;
      const lead = state.leads.find((item) => item.id === followUp.leadId);
      if (
        action.status === "pending" &&
        (!lead ||
          isSuppressed(lead) ||
          Date.parse(followUp.at) <= Date.now() ||
          state.stages.find((stage) => stage.id === lead.stageId)?.noFollowUps)
      )
        return state;
      return {
        ...state,
        followUps: state.followUps.map((item) =>
          item.id === action.id ? { ...item, status: action.status } : item,
        ),
      };
    }
    case "restoreData": {
      if (state.call?.active || isDirty(state)) return state;
      const data = action.data;
      if (
        !data ||
        typeof data !== "object" ||
        !data.preferences ||
        typeof data.preferences !== "object" ||
        ![
          data.preferences.workspaceName,
          data.preferences.displayName,
          data.preferences.email,
          data.preferences.microphone,
        ].every((item) => typeof item === "string") ||
        typeof data.recordingEnabled !== "boolean" ||
        !Array.isArray(data.leads) ||
        !validIds(data.leads) ||
        !Array.isArray(data.logs) ||
        !validIds(data.logs) ||
        !Array.isArray(data.bookings) ||
        !validIds(data.bookings) ||
        !Array.isArray(data.sessions) ||
        !validIds(data.sessions) ||
        !Array.isArray(data.followUps) ||
        !validIds(data.followUps) ||
        !Array.isArray(data.importBatches) ||
        !validIds(data.importBatches) ||
        !Array.isArray(data.suppressedNumbers) ||
        data.suppressedNumbers.some(
          (phone) => typeof phone !== "string" || dialNumber(phone) !== phone,
        ) ||
        !Array.isArray(data.templates) ||
        !Array.isArray(data.stages) ||
        !Array.isArray(data.customFields) ||
        !validConfiguration({
          templates: data.templates,
          stages: data.stages,
          customFields: data.customFields,
        })
      )
        return state;
      if (
        data.leads.some(
          (lead) =>
            typeof lead.business !== "string" ||
            !lead.business.trim() ||
            !isValidZone(lead.zone) ||
            !Number.isFinite(lead.calls) ||
            lead.calls < 0,
        ) ||
        data.logs.some(
          (log) =>
            !Number.isFinite(Date.parse(log.at)) ||
            !Number.isFinite(log.seconds) ||
            log.seconds < 0,
        )
      )
        return state;
      const leads = data.leads.map((lead) => ({
        ...lead,
        suppressed:
          isSuppressed(lead) ||
          leadPhones(lead).some((phone) => state.suppressedNumbers.includes(phone)),
      }));
      const selected = leads[0] ?? emptyLead();
      return {
        ...state,
        ...data,
        leads,
        selectedId: selected.id,
        draft: { ...selected },
        call: null,
        queueIds: leads.map((lead) => lead.id),
        queueComplete: false,
        activeSessionId: null,
        sessions: data.sessions.map((session) => ({
          ...session,
          status: session.status === "running" ? "paused" : session.status,
          paused: session.status === "running" || session.status === "paused",
          startedAt: null,
        })),
        suppressedNumbers: [
          ...new Set([
            ...state.suppressedNumbers,
            ...data.suppressedNumbers
              .map(dialNumber)
              .filter((phone): phone is string => Boolean(phone)),
            ...leads.filter(isSuppressed).flatMap(leadPhones),
          ]),
        ],
      };
    }
    case "deleteLeads": {
      if (state.call?.active || isDirty(state)) return state;
      const leads = state.leads.filter((lead) => !action.ids.includes(lead.id));
      const lead = leads.find((item) => item.id === state.selectedId) ?? leads[0] ?? emptyLead();
      const remainingQueue = state.queueIds.filter((id) => !action.ids.includes(id));
      return {
        ...state,
        leads,
        selectedId: lead.id,
        draft: { ...lead },
        call: state.call?.leadId === lead.id ? state.call : null,
        queueIds: remainingQueue.includes(lead.id) ? remainingQueue : leads.map((item) => item.id),
        sessions: state.sessions.map((session) => ({
          ...session,
          leadIds: session.leadIds.filter((id) => !action.ids.includes(id)),
        })),
        followUps: state.followUps.map((item) =>
          action.ids.includes(item.leadId) && item.status === "pending"
            ? { ...item, status: "cancelled" }
            : item,
        ),
        suppressedNumbers: [
          ...new Set([
            ...state.suppressedNumbers,
            ...state.leads.filter(isSuppressed).flatMap(leadPhones),
          ]),
        ],
      };
    }
    case "queue": {
      if (state.call?.active || isDirty(state) || state.activeSessionId) return state;
      const ids = [...new Set(action.ids)].filter((id) =>
        state.leads.some((lead) => lead.id === id),
      );
      const lead = state.leads.find((item) => item.id === ids[0]);
      return lead
        ? {
            ...state,
            queueIds: ids,
            selectedId: lead.id,
            draft: { ...lead },
            call: null,
            queueComplete: false,
          }
        : state;
    }
  }
}
