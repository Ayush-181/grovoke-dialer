import { describe, expect, test } from "bun:test";
import {
  validateCustomValues,
  validateDraft,
  type CustomField,
  type FollowUp,
} from "../src/remake/domain";
import { metrics, sessionElapsed } from "../src/remake/metrics";
import {
  initialState,
  isDirty,
  reducer,
  type DataSnapshot,
  type Lead,
  type State,
} from "../src/remake/model";

const at = "2026-10-23T12:00:00Z";
const now = Date.parse(at);
function snapshot(state: State): DataSnapshot {
  const {
    leads,
    logs,
    bookings,
    sessions,
    templates,
    stages,
    customFields,
    followUps,
    importBatches,
    suppressedNumbers,
    preferences,
    recordingEnabled,
  } = state;
  return {
    leads,
    logs,
    bookings,
    sessions,
    templates,
    stages,
    customFields,
    followUps,
    importBatches,
    suppressedNumbers,
    preferences,
    recordingEnabled,
  };
}
function pending(leadId = "demo-0"): FollowUp {
  return {
    id: "explicit-followup",
    leadId,
    at: "2099-10-23T12:00:00Z",
    zone: "America/New_York",
    reason: "Requested follow-up",
    status: "pending",
  };
}
function finish(state: State): State {
  return reducer(state, { type: "end", at: "2026-10-23T12:05:00Z" });
}

describe("CRM workflow invariants", () => {
  test("each new attempt starts with a fresh disposition and does not copy previous research into its log", () => {
    let state = reducer(initialState(), { type: "select", id: "demo-1" });
    const original = state.leads[1]!;
    state = reducer(state, { type: "dial", id: "fresh-attempt", at });
    expect(state.draft).toMatchObject({
      outcome: "",
      notes: "",
      triage: false,
      offered: false,
      calls: original.calls + 1,
    });
    expect(state.logs[0]).toMatchObject({
      outcome: "",
      notes: "",
      triage: false,
      offered: false,
      booked: false,
      callback: false,
    });
    expect(isDirty(state)).toBe(false);
    expect(state.logs.find((log) => log.id === "history-1")?.triage).toBe(true);
    state = reducer(finish(state), {
      type: "edit",
      patch: { outcome: "not_interested", notes: "Spoke to owner" },
    });
    state = reducer(state, { type: "save", now });
    expect(metrics([state.logs[0]!])).toMatchObject({
      dials: 1,
      connected: 1,
      triage: 0,
      booked: 0,
    });
    expect(state.leads[1]?.stageId).toBe("closed");
    state = reducer(state, { type: "dial", id: "following-attempt", at });
    expect(state.draft.notes).toBe("");
    expect(state.logs.find((log) => log.id === "fresh-attempt")?.notes).toBe("Spoke to owner");
  });

  test("genuine unsaved pre-call notes are preserved, without attributing them to another attempt", () => {
    const draft = reducer(initialState(), {
      type: "edit",
      patch: { notes: "Ask about Saturday opening" },
    });
    const state = reducer(draft, { type: "dial", id: "prepared-call", at });
    expect(state.draft.notes).toBe("Ask about Saturday opening");
    expect(state.logs[0]?.notes).toBe("");
    expect(reducer(finish(state), { type: "dial", id: "prepared-call", at })).toEqual(
      finish(state),
    );
  });

  test("ringing, conversation and held time are separate, with throttled interval recovery", () => {
    let state = reducer(initialState(), { type: "dial", id: "timing", at, phase: "connecting" });
    state = reducer(state, { type: "tick", now: now + 5500 });
    expect(state.call).toMatchObject({ seconds: 5, ringingSeconds: 5, talkSeconds: 0 });
    expect(metrics([state.logs[0]!]).talk).toBe(0);
    expect(reducer(state, { type: "milestone", kind: "triage", enabled: true })).toBe(state);
    expect(reducer(state, { type: "answer", id: "stale", at })).toBe(state);
    state = reducer(state, { type: "answer", id: "timing", at: "2026-10-23T12:00:05Z" });
    state = reducer(state, { type: "tick", now: now + 10300 });
    state = reducer(state, { type: "hold" });
    state = reducer(state, { type: "tick", now: now + 13700 });
    expect(state.call).toMatchObject({
      seconds: 13,
      ringingSeconds: 5,
      talkSeconds: 5,
      heldSeconds: 3,
    });
    expect(metrics([state.logs[0]!]).talk).toBe(5);
    expect(reducer(state, { type: "providerTime", id: "stale", seconds: 100 })).toBe(state);
    state = reducer(state, {
      type: "providerTime",
      id: "timing",
      seconds: 20,
      talkSeconds: 200,
      heldSeconds: -4,
    });
    expect(state.call).toMatchObject({
      seconds: 20,
      talkSeconds: 20,
      heldSeconds: 0,
      ringingSeconds: 0,
    });
    expect(reducer(state, { type: "providerTime", seconds: Number.NaN })).toBe(state);
    state = finish(state);
    expect(reducer(state, { type: "tick", now: now + 999000 })).toBe(state);
    expect(reducer(state, { type: "providerTime", seconds: 999 })).toBe(state);
  });

  test("canonical suppression survives edited outcomes and deleted leads, including contact numbers", () => {
    let state = reducer(initialState(), { type: "select", id: "demo-6" });
    state = reducer(state, { type: "edit", patch: { outcome: "connected_dm", suppressed: false } });
    state = reducer(state, { type: "save", now });
    expect(state.draft.suppressed).toBe(true);
    expect(reducer(state, { type: "dial", id: "blocked", at })).toBe(state);
    state = reducer(state, { type: "deleteLeads", ids: ["demo-6"] });
    expect(
      reducer(state, {
        type: "manualDial",
        id: "blocked-again",
        leadId: "new-record",
        phone: "212-555-0106",
        name: "",
        at,
      }),
    ).toBe(state);
    const lead = {
      ...state.leads[1]!,
      contacts: [
        ...state.leads[1]!.contacts!,
        { id: "second-contact", name: "Owner", role: "Director", phone: "+12125550198", email: "" },
      ],
    };
    state = reducer(state, { type: "updateLead", lead, now });
    const before = state.leads.length;
    state = reducer(state, {
      type: "manualDial",
      id: "contact-call",
      leadId: "unused",
      phone: "2125550198",
      name: "",
      at,
    });
    expect(state.leads).toHaveLength(before);
    expect(state.selectedId).toBe(lead.id);
    expect(state.call?.phone).toBe("+12125550198");
  });

  test("linked appointments cannot contradict the attempt outcome or be unmarked by local record deletion", () => {
    let state = reducer(initialState(), { type: "dial", id: "booked-call", at });
    const booking = {
      ...state.bookings[0]!,
      id: "linked-booking",
      leadId: state.selectedId,
      at: "2099-10-23T15:00:00Z",
    };
    state = reducer(state, { type: "booking", booking });
    expect(state.bookings.at(-1)?.originatingCallId).toBe("booked-call");
    expect(reducer(state, { type: "booking", booking })).toBe(state);
    state = reducer(state, { type: "edit", patch: { outcome: "no_answer" } });
    expect(state.draft.outcome).toBe("appointment_set");
    state = reducer(state, { type: "deleteBooking", id: booking.id });
    expect(state.logs[0]?.bookingIds).toEqual([booking.id]);
    expect(reducer(state, { type: "milestone", kind: "booked", enabled: false })).toBe(state);
    state = reducer(finish(state), { type: "save", now });
    expect(metrics([state.logs[0]!])).toMatchObject({ dials: 1, connected: 1, booked: 1 });
    const ringing = reducer(initialState(), {
      type: "dial",
      id: "unanswered",
      at,
      phase: "connecting",
    });
    const unrelated = reducer(ringing, { type: "booking", booking });
    expect(unrelated.logs[0]?.booked).toBe(false);
  });

  test("explicit stages work alongside outcome mapping and terminal stages cancel pending follow-ups", () => {
    let state = initialState();
    state = reducer(state, { type: "followUp", followUp: pending(), now });
    state = reducer(state, {
      type: "updateLead",
      lead: { ...state.leads[0]!, stageId: "closed" },
      now,
    });
    expect(state.leads[0]?.stageId).toBe("closed");
    expect(state.followUps[0]?.status).toBe("cancelled");
    expect(reducer(state, { type: "followUp", followUp: pending(), now })).toBe(state);
    expect(reducer(state, { type: "followUpStatus", id: pending().id, status: "pending" })).toBe(
      state,
    );
    state = reducer(state, {
      type: "updateLead",
      lead: { ...state.leads[0]!, stageId: "new" },
      now,
    });
    state = reducer(state, { type: "followUp", followUp: pending(), now });
    const next = reducer(state, {
      type: "followUp",
      followUp: { ...pending("demo-1"), reason: "Move same ID" },
      now,
    });
    expect(next).toBe(state);
    state = reducer(state, { type: "followUpStatus", id: pending().id, status: "completed" });
    expect(state.followUps[0]?.status).toBe("completed");
    state = reducer(state, { type: "edit", patch: { outcome: "callback_requested" } });
    state = reducer(state, { type: "save", now });
    expect(state.leads[0]?.stageId).toBe("callback");
  });

  test("imports fill blanks per field while protecting existing results and count their dry-run skips once", () => {
    let state = initialState();
    const lead = {
      ...state.leads[0]!,
      direct: "",
      email: "",
      customValues: { existing: "keep", blank: "" },
    };
    state = { ...state, leads: [lead, ...state.leads.slice(1)], draft: lead };
    const incoming: Lead = {
      ...lead,
      id: "csv-alternate-id",
      phone: "(212) 555-0100",
      direct: "+12125550199",
      email: "new@example.invalid",
      business: "Overwrite attempt",
      calls: 100,
      outcome: "appointment_set",
      customValues: { existing: "replace", blank: "filled", new: 4 },
    };
    const action = {
      type: "import" as const,
      id: "batch-one",
      at,
      mode: "fill_blanks" as const,
      skipped: 3,
      leads: [incoming],
    };
    state = reducer(state, action);
    expect(state.leads[0]).toMatchObject({
      business: lead.business,
      calls: lead.calls,
      outcome: lead.outcome,
      direct: incoming.direct,
      email: incoming.email,
      customValues: { existing: "keep", blank: "filled", new: 4 },
    });
    expect(state.importBatches.at(-1)).toMatchObject({ added: 0, updated: 1, skipped: 3 });
    expect(reducer(state, action)).toBe(state);
    const duplicate = {
      ...incoming,
      id: "another",
      phone: "+12125550197",
      direct: "",
      contacts: [
        { id: "same-contact", name: "Owner", role: "Owner", phone: lead.phone, email: "" },
      ],
    };
    const ignored = reducer(state, {
      type: "import",
      leads: [duplicate],
      id: "duplicate-batch",
      at,
    });
    expect(ignored.leads).toHaveLength(state.leads.length);
    expect(ignored.importBatches.at(-1)?.skipped).toBe(1);
  });

  test("restore permits an empty workspace without reseeding synthetic records, and protects active calls", () => {
    const initial = initialState();
    const data = {
      ...snapshot(initial),
      leads: [],
      logs: [],
      sessions: [],
      bookings: [],
      followUps: [],
      importBatches: [],
      suppressedNumbers: [],
    };
    const restored = reducer(initial, { type: "restoreData", data });
    expect(restored.leads).toEqual([]);
    expect(restored.selectedId).toBe("");
    expect(restored.draft.business).toBe("");
    expect(isDirty(restored)).toBe(false);
    expect(restored.suppressedNumbers).toContain("+12125550106");
    const active = reducer(initial, { type: "dial", id: "active", at });
    expect(reducer(active, { type: "restoreData", data })).toBe(active);
    expect(
      reducer(initial, {
        type: "restoreData",
        data: { ...data, leads: [initial.leads[0]!, initial.leads[0]!] },
      }),
    ).toBe(initial);
    expect(
      reducer(initial, {
        type: "restoreData",
        data: { ...data, templates: [null] } as unknown as DataSnapshot,
      }),
    ).toBe(initial);
  });

  test("stopping an active session closes its attempt once and freezes session time", () => {
    let state = initialState();
    const id = state.sessions[0]!.id;
    state = reducer(state, { type: "startSession", id, now });
    state = reducer(state, { type: "dial", id: "session-attempt", at });
    expect(
      reducer(state, { type: "setSessionStatus", id, status: "paused", now: now + 1000 }),
    ).toBe(state);
    state = reducer(state, { type: "tick", now: now + 60000 });
    state = reducer(state, { type: "setSessionStatus", id, status: "stopped", now: now + 60000 });
    expect(state.call?.active).toBe(false);
    expect(state.activeSessionId).toBeNull();
    expect(sessionElapsed(state.sessions[0]!, now + 999999)).toBe(60000);
    expect(state.logs.filter((log) => log.id === "session-attempt")).toHaveLength(1);
    expect(reducer(state, { type: "end", at })).toBe(state);
    expect(reducer(state, { type: "tick" })).toBe(state);
  });

  test("synthetic call counts come from one stored attempt per dialed lead", () => {
    const state = initialState();
    for (const lead of state.leads)
      expect(lead.calls).toBe(state.logs.filter((log) => log.leadId === lead.id).length);
  });
});

describe("shared record validation", () => {
  test("callback times require future real instants and disambiguation at daylight-saving transitions", () => {
    const lead = initialState().leads[0]!;
    expect(
      validateDraft({ ...lead, callbackAt: "2026-03-08T02:30" }, Date.parse("2026-01-01")),
    ).toContain("does not exist");
    expect(validateDraft({ ...lead, callbackAt: "2026-11-01T01:30" }, now)).toContain("occurrence");
    expect(
      validateDraft({ ...lead, callbackAt: "2026-11-01T01:30", callbackOccurrence: 1 }, now),
    ).toBeNull();
    expect(validateDraft({ ...lead, callbackAt: "2026-10-20T09:00" }, now)).toContain("future");
    const overdue = { ...lead, callbackAt: "2026-10-20T09:00" };
    expect(validateDraft({ ...overdue, notes: "Edited research" }, now, overdue)).toBeNull();
    expect(validateDraft({ ...lead, email: "invalid" }, now)).toContain("email");
    expect(validateDraft({ ...lead, website: "javascript:alert(1)" }, now)).toContain("website");
    expect(validateDraft({ ...lead, website: "https://example.invalid/about" }, now)).toBeNull();
  });

  test("all custom field types validate meaningful values, while removed definitions preserve research data", () => {
    const types: CustomField["type"][] = ["text", "number", "date", "select", "checkbox", "url"];
    const fields = types.map((type) => ({
      id: type,
      label: type,
      type,
      options: type === "select" ? ["A", "B"] : [],
      showInTable: true,
    }));
    const values = {
      text: "Research",
      number: 0,
      date: "2026-10-23",
      select: "A",
      checkbox: false,
      url: "https://example.invalid",
      removed: "Keep in backups",
    };
    expect(validateCustomValues(fields, values)).toBeNull();
    for (const bad of [
      { number: "NaN" },
      { date: "2026-02-30" },
      { select: "C" },
      { checkbox: "yes" },
      { url: "javascript:alert(1)" },
      { text: 7 },
    ]) {
      expect(validateCustomValues(fields, { ...values, ...bad })).not.toBeNull();
    }
    let state = reducer(initialState(), { type: "configuration", patch: { customFields: fields } });
    state = reducer(state, { type: "edit", patch: { customValues: values } });
    state = reducer(state, { type: "save", now });
    state = reducer(state, { type: "configuration", patch: { customFields: [] } });
    expect(state.leads[0]?.customValues?.removed).toBe("Keep in backups");
    const duplicatedMapping = [...state.stages, { ...state.stages[1]!, id: "duplicate" }];
    expect(reducer(state, { type: "configuration", patch: { stages: duplicatedMapping } })).toBe(
      state,
    );
  });
});
