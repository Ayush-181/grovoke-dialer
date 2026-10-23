import { bookingInstants } from "../lib/booking-time";
import { dialNumber } from "./numbers";
import type { Lead } from "./model";

export type Contact = { id: string; name: string; role: string; phone: string; email: string };
export type ScriptTemplate = {
  id: string;
  name: string;
  kind: "opener" | "gatekeeper" | "voicemail";
  body: string;
};
export type CustomValue = string | number | boolean | null;
export type CustomField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox" | "url";
  options: string[];
  showInTable: boolean;
};
export type PipelineStage = {
  id: string;
  label: string;
  terminal: boolean;
  noFollowUps: boolean;
  outcomes: string[];
};
export type FollowUp = {
  id: string;
  leadId: string;
  contactId?: string;
  at: string;
  zone: string;
  reason: string;
  status: "pending" | "completed" | "cancelled";
};
export type ImportBatch = {
  id: string;
  at: string;
  added: number;
  updated: number;
  skipped: number;
};

export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function leadPhones(lead: Pick<Lead, "phone" | "direct" | "contacts">): string[] {
  return [
    ...new Set(
      [lead.phone, lead.direct, ...(lead.contacts ?? []).map((item) => item.phone)]
        .map(dialNumber)
        .filter((phone): phone is string => Boolean(phone)),
    ),
  ];
}
export function isSuppressed(lead: Pick<Lead, "outcome" | "suppressed">): boolean {
  return lead.suppressed === true || lead.outcome === "do_not_call";
}
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateDraft(
  lead: Lead,
  now: number | Date = Date.now(),
  previous?: Lead,
): string | null {
  if (!lead.business.trim()) return "Enter a business or contact name.";
  if (lead.email && !emailPattern.test(lead.email))
    return "Enter a valid contact email, or clear the field, before saving.";
  if (lead.phone && !dialNumber(lead.phone))
    return "Enter a valid main number with its country code.";
  if (lead.direct && !dialNumber(lead.direct))
    return "Enter a valid direct number with its country code.";
  if (lead.website) {
    try {
      const url = new URL(
        /^[a-z][a-z0-9+.-]*:/i.test(lead.website) ? lead.website : `https://${lead.website}`,
      );
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes("."))
        return "Enter a valid website using http or https, or clear the field.";
    } catch {
      return "Enter a valid website using http or https, or clear the field.";
    }
  }
  if (!isValidZone(lead.zone)) return "Choose a valid lead timezone.";
  const contactIds = new Set<string>();
  for (const contact of lead.contacts ?? []) {
    if (!contact.id || contactIds.has(contact.id))
      return "Each contact must have a unique identifier.";
    contactIds.add(contact.id);
    if (!contact.name.trim()) return "Enter a name for each contact.";
    if (contact.email && !emailPattern.test(contact.email))
      return "Enter a valid email for each contact, or clear the field.";
    if (contact.phone && !dialNumber(contact.phone))
      return "Enter valid contact numbers with their country codes.";
  }
  if (
    lead.callbackAt &&
    (!previous ||
      lead.callbackAt !== previous.callbackAt ||
      lead.zone !== previous.zone ||
      lead.callbackOccurrence !== previous.callbackOccurrence)
  ) {
    const candidates = bookingInstants(lead.callbackAt, lead.zone);
    if (!candidates.length)
      return "That callback time does not exist in the lead’s timezone. Choose another time.";
    if (candidates.length > 1 && lead.callbackOccurrence === undefined)
      return "Choose which occurrence of this repeated callback time to use.";
    const instant = candidates[lead.callbackOccurrence ?? 0];
    if (!instant) return "Choose a valid callback time occurrence.";
    const nowValue = now instanceof Date ? now.getTime() : now;
    if (instant.getTime() <= nowValue) return "Choose a future callback time.";
  }
  return null;
}
export function validateCustomValues(
  fields: CustomField[],
  values: Record<string, CustomValue> = {},
): string | null {
  if (
    Object.values(values).some(
      (value) =>
        (value !== null && !["string", "number", "boolean"].includes(typeof value)) ||
        (typeof value === "number" && !Number.isFinite(value)),
    )
  )
    return "Custom fields must contain text, finite numbers, yes or no, or an empty value.";
  for (const field of fields) {
    const value = values[field.id];
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value)))
      return `${field.label} must be a number.`;
    if (field.type === "checkbox" && typeof value !== "boolean")
      return `${field.label} must be yes or no.`;
    if (field.type === "select" && (typeof value !== "string" || !field.options.includes(value)))
      return `Choose an available value for ${field.label}.`;
    if (field.type === "date") {
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
      )
        return `${field.label} must be a valid date.`;
    }
    if (field.type === "url") {
      try {
        const url = new URL(String(value));
        if (!["https:", "http:"].includes(url.protocol))
          return `${field.label} must be an http or https link.`;
      } catch {
        return `${field.label} must be a valid link.`;
      }
    }
    if (field.type === "text" && typeof value !== "string") return `${field.label} must be text.`;
  }
  return null;
}
export function defaultTemplates(): ScriptTemplate[] {
  return [
    {
      id: "template-opener",
      name: "Call opener",
      kind: "opener",
      body: "Hi {FirstName}, this is {MyName}. I’m calling about {Company}. Is now a good time for a quick question?",
    },
    {
      id: "template-gatekeeper",
      name: "Gatekeeper",
      kind: "gatekeeper",
      body: "Hi, who handles enquiries at {Company}? Could you put me through to {FirstName}?",
    },
    {
      id: "template-voicemail",
      name: "Voicemail",
      kind: "voicemail",
      body: "Hi {FirstName}, this is {MyName}. I had a question about {Company}. You can reach me at {MyPhone}.",
    },
  ];
}
export function defaultStages(): PipelineStage[] {
  return [
    { id: "new", label: "New", terminal: false, noFollowUps: false, outcomes: [] },
    {
      id: "contacted",
      label: "Contacted",
      terminal: false,
      noFollowUps: false,
      outcomes: [
        "connected_dm",
        "connected_gk",
        "connected_other",
        "voicemail",
        "no_answer",
        "busy",
      ],
    },
    {
      id: "callback",
      label: "Callback",
      terminal: false,
      noFollowUps: false,
      outcomes: ["callback_requested"],
    },
    {
      id: "booked",
      label: "Appointment booked",
      terminal: false,
      noFollowUps: false,
      outcomes: ["appointment_set"],
    },
    {
      id: "closed",
      label: "Closed",
      terminal: true,
      noFollowUps: true,
      outcomes: ["not_interested", "bad_number"],
    },
    {
      id: "dnc",
      label: "Do not call",
      terminal: true,
      noFollowUps: true,
      outcomes: ["do_not_call"],
    },
  ];
}
