export const OUTCOMES = [
  { value: "connected_dm", label: "Connected - DM", tone: "good" },
  { value: "connected_gk", label: "Connected - GK", tone: "good" },
  { value: "connected_other", label: "Connected - Other", tone: "good" },
  { value: "appointment_set", label: "Appointment Set", tone: "good" },
  { value: "callback_requested", label: "Callback Requested", tone: "warn" },
  { value: "voicemail", label: "Voicemail", tone: "neutral" },
  { value: "busy", label: "Busy", tone: "neutral" },
  { value: "no_answer", label: "No Answer", tone: "neutral" },
  { value: "dialed", label: "Dialed", tone: "neutral" },
  { value: "not_interested", label: "Not Interested", tone: "bad" },
  { value: "bad_number", label: "Bad Number", tone: "bad" },
  { value: "do_not_call", label: "Do Not Call", tone: "bad" },
] as const;

export type Outcome = (typeof OUTCOMES)[number]["value"];

export const CONNECTED_OUTCOMES: Outcome[] = [
  "connected_dm",
  "connected_gk",
  "connected_other",
  "appointment_set",
  "callback_requested",
];

export const STATUSES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "disqualified", label: "Disqualified" },
] as const;

export type LeadStatus = (typeof STATUSES)[number]["value"];

export function outcomeLabel(v?: string | null): string {
  if (!v) return "—";
  return OUTCOMES.find((o) => o.value === v)?.label ?? v;
}

export function statusLabel(v?: string | null): string {
  if (!v) return "—";
  return STATUSES.find((s) => s.value === v)?.label ?? v;
}

export function outcomeTone(v?: string | null): "good" | "warn" | "bad" | "neutral" {
  return OUTCOMES.find((o) => o.value === v)?.tone ?? "neutral";
}

/** Terminal outcomes mark the lead as completed / disqualified. */
export function statusForOutcome(o: Outcome): LeadStatus {
  if (o === "do_not_call" || o === "bad_number" || o === "not_interested") return "disqualified";
  if (o === "appointment_set" || o === "connected_dm") return "completed";
  return "in_progress";
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
