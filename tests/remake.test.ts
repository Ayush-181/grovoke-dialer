import { describe, expect, test } from "bun:test";
import { shortcutCommand } from "../src/remake/shortcuts";
import { dialNumber } from "../src/remake/numbers";
import { dateKey, inPeriod, metrics, sessionElapsed, sessionTime } from "../src/remake/metrics";
import { initialState, isDirty, reducer } from "../src/remake/model";

describe("isolated calling workflow", () => {
  test("editing a different lead never rewrites the previous call's notes or outcome", () => {
    let state = reducer(initialState(), { type: "dial", id: "first-lead-call" });
    state = reducer(state, { type: "end", at: "2026-10-09T12:00:00Z" });
    state = reducer(state, {
      type: "edit",
      patch: { outcome: "connected_gk", notes: "Original conversation" },
    });
    state = reducer(state, { type: "save" });
    state = reducer(state, { type: "select", id: "demo-1" });
    expect(state.call).toBeNull();
    state = reducer(state, {
      type: "edit",
      patch: { outcome: "no_answer", notes: "Different lead" },
    });
    state = reducer(state, { type: "save" });
    expect(state.logs[0]?.notes).toBe("Original conversation");
    expect(state.logs[0]?.outcome).toBe("connected_gk");
  });
  test("edits and outcome selection never advance; explicit save and next persist details", () => {
    let state = initialState();
    const first = state.selectedId;
    state = reducer(state, {
      type: "edit",
      patch: {
        contact: "Demo manager",
        notes: "Call after lunch",
        outcome: "connected_gk",
        callback: true,
        callbackReason: "Ask for manager",
      },
    });
    expect(state.selectedId).toBe(first);
    expect(isDirty(state)).toBe(true);
    expect(reducer(state, { type: "select", id: "demo-1" })).toBe(state);
    state = reducer(state, { type: "save" });
    expect(state.selectedId).toBe(first);
    expect(isDirty(state)).toBe(false);
    state = reducer(state, { type: "save", next: true });
    expect(state.selectedId).toBe("demo-1");
    expect(state.call).toBeNull();
    state = reducer(state, { type: "select", id: first });
    expect(state.draft.contact).toBe("Demo manager");
    expect(state.draft.notes).toBe("Call after lunch");
    expect(state.draft.outcome).toBe("connected_gk");
    expect(state.draft.callback).toBe(true);
  });
  test("new calls snapshot recording preferences; active calls cannot advance or save", () => {
    let state = reducer(initialState(), { type: "recording", enabled: true });
    state = reducer(state, { type: "dial", id: "call-one" });
    expect(state.draft.calls).toBe(1);
    expect(state.call?.recording).toBe(true);
    expect(reducer(state, { type: "dial", id: "double-click" })).toBe(state);
    state = reducer(state, { type: "recording", enabled: false });
    expect(state.call?.recording).toBe(true);
    expect(reducer(state, { type: "save", next: true })).toBe(state);
    expect(reducer(state, { type: "select", id: "demo-1" })).toBe(state);
    state = reducer(state, { type: "end", at: "2026-10-09T12:00:00Z" });
    expect(state.logs[0]?.recording).toBe(true);
    expect(reducer(state, { type: "end", at: "2026-10-09T12:01:00Z" })).toBe(state);
    state = reducer(state, { type: "dial", id: "call-two" });
    expect(state.call?.recording).toBe(false);
    expect(state.draft.calls).toBe(2);
  });
  test("conference participants, mute and keypad stay available without advancing the lead", () => {
    let state = reducer(initialState(), { type: "dial", id: "conference" });
    state = reducer(state, { type: "participant", phone: "+12125550198", name: "Decision maker" });
    state = reducer(state, { type: "participant", phone: "+12125550198", name: "Decision maker" });
    state = reducer(state, { type: "digit", value: "4" });
    state = reducer(state, { type: "mute" });
    expect(state.call?.participants).toEqual([{ phone: "+12125550198", name: "Decision maker" }]);
    expect(state.call?.digits).toBe("4");
    expect(state.call?.muted).toBe(true);
    state = reducer(state, { type: "participant", phone: "+12125550198", remove: true });
    expect(state.call?.active).toBe(true);
    expect(state.selectedId).toBe("demo-0");
  });
  test("do-not-call is blocked and final-lead save does not wrap or dial", () => {
    let state = reducer(initialState(), { type: "select", id: "demo-6" });
    expect(reducer(state, { type: "dial", id: "forbidden" })).toBe(state);
    state = reducer(state, { type: "queue", ids: ["demo-0"] });
    state = reducer(state, { type: "save", next: true });
    expect(state.queueComplete).toBe(true);
    expect(state.selectedId).toBe("demo-0");
    expect(state.call).toBeNull();
  });
  test("call outcome is saved to its attempt without changing earlier history", () => {
    let state = reducer(initialState(), { type: "dial", id: "new-attempt" });
    state = reducer(state, { type: "end", at: "2026-10-09T12:00:00Z" });
    state = reducer(state, { type: "edit", patch: { outcome: "no_answer", notes: "No pickup" } });
    state = reducer(state, { type: "save" });
    expect(state.logs[0]?.outcome).toBe("no_answer");
    expect(state.logs[0]?.notes).toBe("No pickup");
    expect(state.logs[1]?.id).toBe("history-1");
    expect(state.draft.calls).toBe(1);
  });
  test("imports deduplicate both existing and in-batch phones without ghost queue entries", () => {
    const state = initialState();
    const sample = { ...state.leads[0]!, id: "new", phone: "+12125550199", contacts: [] };
    const imported = reducer(state, {
      type: "import",
      leads: [state.leads[0]!, sample, { ...sample, id: "duplicate" }],
    });
    expect(imported.leads.length).toBe(state.leads.length + 1);
    expect(imported.queueIds).not.toContain("duplicate");
  });
  test("deleting a queued lead retains a usable queue and booking deletion changes records only", () => {
    let state = reducer(initialState(), { type: "queue", ids: ["demo-0"] });
    state = reducer(state, { type: "deleteLeads", ids: ["demo-0"] });
    expect(state.queueIds).toContain(state.selectedId);
    const leads = state.leads;
    const logs = state.logs;
    state = reducer(state, { type: "deleteBooking", id: "booking-demo" });
    expect(state.bookings).toHaveLength(0);
    expect(state.leads).toBe(leads);
    expect(state.logs).toBe(logs);
  });
});

describe("call metrics and session timing", () => {
  test("milestones update their metric immediately and count one connection per call", () => {
    let state = initialState();
    expect(reducer(state, { type: "milestone", kind: "triage", enabled: true })).toBe(state);
    state = reducer(state, { type: "dial", id: "metric-call", at: "2026-10-09T12:00:00Z" });
    state = reducer(state, { type: "milestone", kind: "triage", enabled: true });
    expect(metrics([state.logs[0]!])).toMatchObject({
      dials: 1,
      connected: 1,
      triage: 1,
      booked: 0,
    });
    state = reducer(state, { type: "milestone", kind: "booked", enabled: true });
    state = reducer(state, { type: "milestone", kind: "offered", enabled: true });
    state = reducer(state, { type: "milestone", kind: "booked", enabled: true });
    expect(metrics([state.logs[0]!])).toMatchObject({
      connected: 1,
      triage: 1,
      offered: 1,
      booked: 1,
    });
    state = reducer(state, { type: "end", at: "2026-10-09T12:05:00Z" });
    state = reducer(state, { type: "save" });
    expect(metrics([state.logs[0]!]).connected).toBe(1);
    state = reducer(state, { type: "milestone", kind: "booked", enabled: false });
    state = reducer(state, { type: "milestone", kind: "offered", enabled: false });
    expect(metrics([state.logs[0]!])).toMatchObject({ connected: 1, booked: 0, offered: 0 });
    state = reducer(state, { type: "milestone", kind: "triage", enabled: false });
    expect(metrics([state.logs[0]!]).connected).toBe(0);
  });
  test("dials are counted at start, durations stay live and ending never duplicates attempts", () => {
    let state = reducer(initialState(), { type: "dial", id: "timed", at: "2026-10-09T18:29:00Z" });
    expect(state.logs.filter((log) => log.id === "timed")).toHaveLength(1);
    state = reducer(state, { type: "tick" });
    expect(metrics([state.logs[0]!]).talk).toBe(1);
    state = reducer(state, { type: "end", at: "2026-10-09T18:35:00Z" });
    expect(state.logs[0]?.at).toBe("2026-10-09T18:29:00Z");
    expect(state.logs.filter((log) => log.id === "timed")).toHaveLength(1);
    expect(reducer(state, { type: "tick" })).toBe(state);
  });
  test("daily, monthly and annual filters use IST across UTC and year boundaries", () => {
    const fixture = initialState().logs[0]!;
    const logs = [
      { ...fixture, id: "dec", at: "2026-12-31T18:29:59Z" },
      { ...fixture, id: "jan", at: "2026-12-31T18:30:00Z" },
    ];
    expect(dateKey(logs[0]!.at)).toBe("2026-12-31");
    expect(dateKey(logs[1]!.at)).toBe("2027-01-01");
    expect(inPeriod(logs, "2027-01-01").map((log) => log.id)).toEqual(["jan"]);
    expect(inPeriod(logs, "2026-12").map((log) => log.id)).toEqual(["dec"]);
    expect(inPeriod(logs, "2027").map((log) => log.id)).toEqual(["jan"]);
    expect(metrics([])).toMatchObject({
      dials: 0,
      connected: 0,
      connectionRate: 0,
      talk: 0,
      average: 0,
    });
  });
  test("a saved connected outcome and overlapping milestones never double-count Connected", () => {
    const fixture = initialState().logs[0]!;
    expect(
      metrics([{ ...fixture, outcome: "connected_gk", triage: true, offered: true, booked: true }]),
    ).toMatchObject({ dials: 1, connected: 1, triage: 1, offered: 1, booked: 1, gatekeeper: 1 });
    expect(
      metrics([
        { ...fixture, outcome: "appointment_set", triage: false, offered: false, booked: false },
      ]),
    ).toMatchObject({ connected: 1, offered: 1, booked: 1 });
  });
  test("session start never dials, pause excludes elapsed time and resume keeps the selected lead", () => {
    let state = initialState();
    const id = state.sessions[0]!.id;
    state = reducer(state, { type: "startSession", id, now: 1000 });
    expect(state.activeSessionId).toBe(id);
    expect(state.call).toBeNull();
    expect(sessionElapsed(state.sessions[0]!, 61000)).toBe(60000);
    state = reducer(state, { type: "select", id: state.queueIds[1]! });
    const lead = state.selectedId;
    state = reducer(state, { type: "setSessionStatus", id, status: "paused", now: 61000 });
    expect(sessionElapsed(state.sessions[0]!, 121000)).toBe(60000);
    expect(reducer(state, { type: "dial", id: "paused-call" })).toBe(state);
    state = reducer(state, { type: "edit", patch: { notes: "Draft survives resume" } });
    state = reducer(state, { type: "startSession", id, now: 121000 });
    expect(state.selectedId).toBe(lead);
    expect(state.draft.notes).toBe("Draft survives resume");
    state = reducer(state, { type: "setSessionStatus", id, status: "stopped", now: 181000 });
    expect(state.activeSessionId).toBeNull();
    expect(sessionElapsed(state.sessions[0]!, 999000)).toBe(120000);
    expect(sessionTime(3661000)).toBe("01:01:01");
  });
  test("session calls are attributed once and another session cannot take over", () => {
    let state = initialState();
    const id = state.sessions[0]!.id;
    state = reducer(state, { type: "startSession", id, now: 1000 });
    state = reducer(state, {
      type: "session",
      session: {
        ...state.sessions[0]!,
        id: "other",
        status: "ready",
        startedAt: null,
        elapsedMs: 0,
      },
    });
    expect(reducer(state, { type: "startSession", id: "other", now: 2000 })).toBe(state);
    state = reducer(state, { type: "dial", id: "session-call" });
    expect(state.logs[0]?.sessionId).toBe(id);
    expect(reducer(state, { type: "startSession", id, now: 2000 })).toBe(state);
    state = reducer(state, { type: "tick" });
    state = reducer(state, { type: "end", at: "2026-10-09T12:00:00Z" });
    expect(metrics(state.logs.filter((log) => log.sessionId === id))).toMatchObject({
      dials: 1,
      talk: 1,
    });
  });
});

describe("manual dialing and business conferences", () => {
  test("numbers normalize equivalent US formats and accept international country codes", () => {
    expect(dialNumber("(212) 555-0199")).toBe("+12125550199");
    expect(dialNumber("1-212-555-0199")).toBe("+12125550199");
    expect(dialNumber("+91 98765 43210")).toBe("+919876543210");
    for (const value of [
      "abc2125550199",
      "123",
      "+1212555",
      "++12125550199",
      "98765432101234567890",
      "",
    ])
      expect(dialNumber(value)).toBeNull();
  });
  test("a new number gets an independent contact, counter and outcome", () => {
    const original = initialState();
    let state = reducer(original, {
      type: "manualDial",
      id: "manual",
      leadId: "manual-lead",
      phone: "(212) 555-0199",
      name: "Sample business",
      at: "2026-10-10T08:00:00Z",
    });
    expect(state.leads).toHaveLength(original.leads.length + 1);
    expect(state.selectedId).toBe("manual-lead");
    expect(state.call?.phone).toBe("+12125550199");
    expect(state.logs[0]?.phone).toBe("+12125550199");
    expect(state.draft.calls).toBe(1);
    expect(state.leads[0]).toEqual(original.leads[0]);
    state = reducer(state, { type: "end", at: "2026-10-10T08:01:00Z" });
    state = reducer(state, {
      type: "edit",
      patch: { outcome: "connected_dm", notes: "Manual conversation" },
    });
    state = reducer(state, { type: "save" });
    expect(state.logs[0]?.leadId).toBe("manual-lead");
    expect(state.leads.find((lead) => lead.id === "manual-lead")?.notes).toBe(
      "Manual conversation",
    );
    expect(state.leads[0]).toEqual(original.leads[0]);
  });
  test("manual dialing a saved main or direct number reuses the lead without changing its phone", () => {
    let original = initialState();
    original = {
      ...original,
      leads: original.leads.map((lead, i) =>
        i === 1 ? { ...lead, direct: "+12125550198" } : lead,
      ),
    };
    const state = reducer(original, {
      type: "manualDial",
      id: "direct",
      leadId: "unused",
      phone: "212-555-0198",
      name: "Ignored duplicate label",
      at: "2026-10-10T08:00:00Z",
    });
    expect(state.leads).toHaveLength(original.leads.length);
    expect(state.selectedId).toBe("demo-1");
    expect(state.draft.business).toBe("Maple Street Studio");
    expect(state.draft.phone).toBe(original.leads[1]!.phone);
    expect(state.call?.phone).toBe("+12125550198");
    expect(state.logs[0]?.phone).toBe("+12125550198");
  });
  test("invalid, blocked, busy and unsaved manual attempts do not alter contacts or calls", () => {
    const original = initialState();
    const action = {
      type: "manualDial" as const,
      id: "blocked",
      leadId: "unused",
      phone: "+12125550199",
      name: "",
      at: "2026-10-10T08:00:00Z",
    };
    expect(reducer(original, { ...action, phone: "123" })).toBe(original);
    expect(reducer(original, { ...action, phone: "212-555-0106" })).toBe(original);
    const dirty = reducer(original, { type: "edit", patch: { notes: "Keep this draft" } });
    expect(reducer(dirty, action)).toBe(dirty);
    const active = reducer(original, { type: "dial", id: "existing" });
    expect(reducer(active, action)).toBe(active);
    const started = reducer(original, {
      type: "startSession",
      id: original.sessions[0]!.id,
      now: 1000,
    });
    const paused = reducer(started, {
      type: "setSessionStatus",
      id: original.sessions[0]!.id,
      status: "paused",
      now: 2000,
    });
    expect(reducer(paused, action)).toBe(paused);
  });
  test("multiple decision makers join the same business call; duplicate and blocked numbers are rejected", () => {
    let state = reducer(initialState(), { type: "dial", id: "group" });
    const lead = state.selectedId;
    expect(reducer(state, { type: "participant", phone: "212-555-0100" })).toBe(state);
    expect(reducer(state, { type: "participant", phone: "212-555-0106" })).toBe(state);
    state = reducer(state, { type: "participant", phone: "212-555-0198", name: "Owner" });
    expect(
      reducer(state, { type: "participant", phone: "+1 (212) 555-0198", name: "Same owner" }),
    ).toBe(state);
    state = reducer(state, { type: "participant", phone: "+12125550197", name: "Co-founder" });
    expect(state.call?.participants).toHaveLength(2);
    expect(state.logs[0]?.participants).toHaveLength(2);
    expect(state.selectedId).toBe(lead);
    expect(state.draft.calls).toBe(1);
    state = reducer(state, { type: "participant", phone: "+12125550198", remove: true });
    expect(state.call?.active).toBe(true);
    expect(state.call?.participants).toHaveLength(1);
    expect(state.logs[0]?.participants).toHaveLength(2);
    state = reducer(state, { type: "end", at: "2026-10-10T08:00:00Z" });
    expect(
      reducer(state, { type: "participant", phone: "+12125550196", name: "Late caller" }),
    ).toBe(state);
    expect(state.logs.filter((log) => log.id === "group")).toHaveLength(1);
  });
});

describe("calling workspace safeguards", () => {
  test("hold and resume retain the active business, participants and one attempt", () => {
    const idle = initialState();
    expect(reducer(idle, { type: "hold" })).toBe(idle);
    let state = reducer(idle, { type: "dial", id: "held-call" });
    state = reducer(state, { type: "participant", phone: "+12125550198", name: "Owner" });
    const count = state.logs.length;
    state = reducer(state, { type: "hold" });
    state = reducer(state, { type: "tick" });
    expect(state.call?.held).toBe(true);
    expect(state.call?.active).toBe(true);
    expect(state.call?.seconds).toBe(1);
    expect(state.call?.heldSeconds).toBe(1);
    expect(metrics(state.logs.filter((log) => log.id === "held-call")).talk).toBe(0);
    expect(reducer(state, { type: "participant", phone: "+12125550197", name: "Other" })).toBe(
      state,
    );
    expect(reducer(state, { type: "digit", value: "1" })).toBe(state);
    expect(state.call?.participants).toHaveLength(1);
    state = reducer(state, { type: "hold" });
    expect(state.call?.held).toBe(false);
    state = reducer(state, { type: "tick" });
    expect(metrics(state.logs.filter((log) => log.id === "held-call")).talk).toBe(1);
    expect(state.logs).toHaveLength(count);
    expect(state.draft.calls).toBe(1);
    state = reducer(state, { type: "end", at: "2026-10-11T12:00:00Z" });
    expect(reducer(state, { type: "hold" })).toBe(state);
  });
  test("booking during a call preserves its draft and records one connected booking", () => {
    let state = reducer(initialState(), { type: "dial", id: "book-from-call" });
    state = reducer(state, {
      type: "edit",
      patch: { contact: "Decision maker", notes: "Important draft", callback: true },
    });
    const selected = state.selectedId;
    state = reducer(state, {
      type: "booking",
      booking: {
        id: "inline-booking",
        leadId: selected,
        title: "Ash x Harborline Rentals",
        at: "2026-10-20T15:00:00Z",
        zone: "America/New_York",
        duration: 30,
        guests: "contact@example.invalid",
        notes: "",
        meet: true,
      },
    });
    expect(state.selectedId).toBe(selected);
    expect(state.call?.active).toBe(true);
    expect(state.draft.contact).toBe("Decision maker");
    expect(state.draft.notes).toBe("Important draft");
    expect(state.draft.callback).toBe(true);
    expect(state.draft.outcome).toBe("appointment_set");
    expect(metrics(state.logs.filter((log) => log.id === "book-from-call"))).toMatchObject({
      dials: 1,
      connected: 1,
      booked: 1,
    });
    state = reducer(state, { type: "end", at: "2026-10-11T12:00:00Z" });
    state = reducer(state, { type: "save" });
    expect(state.logs[0]?.outcome).toBe("appointment_set");
    expect(state.logs[0]?.notes).toBe("Important draft");
  });
  test("booking a different business cannot mark the active business call", () => {
    const state = reducer(initialState(), { type: "dial", id: "original" });
    const next = reducer(state, {
      type: "booking",
      booking: { ...state.bookings[0]!, id: "other-business" },
    });
    expect(next.draft).toBe(state.draft);
    expect(next.logs[0]).toBe(state.logs[0]);
    expect(next.bookings).toHaveLength(state.bookings.length + 1);
  });
  test("call guide edits require explicit save and remain specific to the lead", () => {
    let state = reducer(initialState(), {
      type: "edit",
      patch: { talkingPoints: "Ask about missed enquiries" },
    });
    expect(isDirty(state)).toBe(true);
    expect(reducer(state, { type: "select", id: "demo-1" })).toBe(state);
    state = reducer(state, { type: "save" });
    state = reducer(state, { type: "select", id: "demo-1" });
    expect(state.draft.talkingPoints).toBeUndefined();
    state = reducer(state, { type: "select", id: "demo-0" });
    expect(state.draft.talkingPoints).toBe("Ask about missed enquiries");
  });
  test("keyboard shortcuts never activate during typing, dialogs, repeats or composition", () => {
    const event = {
      key: "d",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
      defaultPrevented: false,
    };
    expect(shortcutCommand(event, false, false)).toBe("dial");
    expect(shortcutCommand(event, true, false)).toBeNull();
    expect(shortcutCommand(event, false, true)).toBeNull();
    for (const flag of [
      "repeat",
      "isComposing",
      "defaultPrevented",
      "ctrlKey",
      "metaKey",
      "shiftKey",
    ])
      expect(shortcutCommand({ ...event, [flag]: true }, false, false)).toBeNull();
    expect(shortcutCommand({ ...event, key: "1", altKey: false }, false, false)).toBe("outcome-1");
    expect(shortcutCommand({ ...event, key: "Enter", altKey: false }, false, false)).toBeNull();
    expect(shortcutCommand({ ...event, key: "Enter" }, false, false)).toBe("save-next");
  });
});
