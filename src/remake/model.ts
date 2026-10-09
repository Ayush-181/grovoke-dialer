import type { Outcome } from "../lib/outcomes";

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
  outcome: Outcome | "";
  calls: number;
  callback: boolean;
  callbackAt: string;
  callbackReason: string;
  triage: boolean;
  offered: boolean;
};
export type Call = {
  id: string;
  leadId: string;
  active: boolean;
  seconds: number;
  muted: boolean;
  recording: boolean;
  participants: string[];
  digits: string;
};
export type Log = {
  id: string;
  leadId: string;
  at: string;
  seconds: number;
  outcome: Outcome | "";
  notes: string;
  recording: boolean;
};
export type Booking = {
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
export type Session = { id: string; name: string; leadIds: string[]; paused: boolean };
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
    calls: index === 1 ? 2 : index === 4 ? 1 : index === 6 ? 1 : 0,
    callback: index === 4,
    callbackAt: "",
    callbackReason: index === 4 ? "Owner is available after lunch." : "",
    triage: index === 1,
    offered: false,
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
      leadId: leads[i]!.id,
      at: "2026-10-08T17:00:00Z",
      seconds: i === 6 ? 45 : 134,
      outcome: leads[i]!.outcome,
      notes: i === 4 ? "Try again after lunch." : "",
      recording: false,
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
      },
    ],
    queueIds: leads.map((l) => l.id),
    queueComplete: false,
  };
}

export function isDirty(state: State): boolean {
  return (
    JSON.stringify(state.draft) !==
    JSON.stringify(state.leads.find((l) => l.id === state.selectedId))
  );
}
export type Action =
  | { type: "edit"; patch: Partial<Lead> }
  | { type: "select"; id: string }
  | { type: "discard" }
  | { type: "save"; next?: boolean }
  | { type: "dial"; id: string }
  | { type: "end"; at: string }
  | { type: "tick" }
  | { type: "mute" }
  | { type: "digit"; value: string }
  | { type: "participant"; name: string; remove?: boolean }
  | { type: "recording"; enabled: boolean }
  | { type: "booking"; booking: Booking }
  | { type: "deleteBooking"; id: string }
  | { type: "session"; session: Session }
  | { type: "pauseSession"; id: string }
  | { type: "import"; leads: Lead[] }
  | { type: "deleteLeads"; ids: string[] }
  | { type: "preferences"; patch: Partial<State["preferences"]> }
  | { type: "queue"; ids: string[] };

// Pure mock adapter: no networking, provider SDK, microphone or database side effects.
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "edit":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "select": {
      if (state.call?.active || isDirty(state)) return state;
      const lead = state.leads.find((l) => l.id === action.id);
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
    case "discard":
      return { ...state, draft: { ...state.leads.find((l) => l.id === state.selectedId)! } };
    case "save": {
      if (state.call?.active) return state;
      const leads = state.leads.map((l) => (l.id === state.selectedId ? { ...state.draft } : l));
      const logs = state.logs.map((l) =>
        l.id === state.call?.id && l.leadId === state.selectedId
          ? { ...l, outcome: state.draft.outcome, notes: state.draft.notes }
          : l,
      );
      const index = state.queueIds.indexOf(state.selectedId);
      const next =
        action.next && index >= 0
          ? leads.find((l) => l.id === state.queueIds[index + 1])
          : undefined;
      return {
        ...state,
        leads,
        logs,
        ...(next ? { selectedId: next.id, draft: { ...next }, call: null } : {}),
        queueComplete: Boolean(action.next && !next),
      };
    }
    case "dial": {
      if (
        state.call?.active ||
        state.draft.outcome === "do_not_call" ||
        state.leads.find((lead) => lead.id === state.selectedId)?.outcome === "do_not_call"
      )
        return state;
      return {
        ...state,
        leads: state.leads.map((l) =>
          l.id === state.selectedId ? { ...l, calls: l.calls + 1 } : l,
        ),
        draft: { ...state.draft, calls: state.draft.calls + 1 },
        call: {
          id: action.id,
          leadId: state.selectedId,
          active: true,
          seconds: 0,
          muted: false,
          recording: state.recordingEnabled,
          participants: [],
          digits: "",
        },
      };
    }
    case "end": {
      if (!state.call?.active) return state;
      return {
        ...state,
        call: { ...state.call, active: false },
        logs: [
          {
            id: state.call.id,
            leadId: state.call.leadId,
            at: action.at,
            seconds: state.call.seconds,
            outcome: "",
            notes: "",
            recording: state.call.recording,
          },
          ...state.logs,
        ],
      };
    }
    case "tick":
      return state.call?.active
        ? { ...state, call: { ...state.call, seconds: state.call.seconds + 1 } }
        : state;
    case "mute":
      return state.call?.active
        ? { ...state, call: { ...state.call, muted: !state.call.muted } }
        : state;
    case "digit":
      return state.call?.active
        ? {
            ...state,
            call: { ...state.call, digits: `${state.call.digits}${action.value}`.slice(-32) },
          }
        : state;
    case "participant":
      return state.call?.active
        ? {
            ...state,
            call: {
              ...state.call,
              participants: action.remove
                ? state.call.participants.filter((p) => p !== action.name)
                : [...new Set([...state.call.participants, action.name])],
            },
          }
        : state;
    case "recording":
      return { ...state, recordingEnabled: action.enabled };
    case "preferences":
      return { ...state, preferences: { ...state.preferences, ...action.patch } };
    case "booking":
      return { ...state, bookings: [...state.bookings, action.booking] };
    case "deleteBooking":
      return { ...state, bookings: state.bookings.filter((b) => b.id !== action.id) };
    case "session":
      return { ...state, sessions: [...state.sessions, action.session] };
    case "pauseSession":
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, paused: !s.paused } : s)),
      };
    case "import": {
      const seen = new Set(state.leads.map((lead) => lead.phone));
      const added = action.leads.filter((lead) => {
        if (seen.has(lead.phone)) return false;
        seen.add(lead.phone);
        return true;
      });
      return {
        ...state,
        leads: [...state.leads, ...added],
        queueIds: [...state.queueIds, ...added.map((lead) => lead.id)],
      };
    }
    case "deleteLeads": {
      if (state.call?.active || isDirty(state)) return state;
      const leads = state.leads.filter((l) => !action.ids.includes(l.id));
      if (!leads.length) return state;
      const lead = leads.find((l) => l.id === state.selectedId) ?? leads[0]!;
      const remainingQueue = state.queueIds.filter((id) => !action.ids.includes(id));
      return {
        ...state,
        leads,
        selectedId: lead.id,
        draft: { ...lead },
        call: state.call?.leadId === lead.id ? state.call : null,
        queueIds: remainingQueue.includes(lead.id) ? remainingQueue : leads.map((l) => l.id),
        sessions: state.sessions.map((s) => ({
          ...s,
          leadIds: s.leadIds.filter((id) => !action.ids.includes(id)),
        })),
      };
    }
    case "queue": {
      if (state.call?.active || isDirty(state)) return state;
      const lead = state.leads.find((l) => l.id === action.ids[0]);
      return lead
        ? {
            ...state,
            queueIds: action.ids,
            selectedId: lead.id,
            draft: { ...lead },
            call: null,
            queueComplete: false,
          }
        : state;
    }
  }
}
