import { describe, expect, test } from "bun:test";
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
    state = reducer(state, { type: "participant", name: "Demo teammate" });
    state = reducer(state, { type: "participant", name: "Demo teammate" });
    state = reducer(state, { type: "digit", value: "4" });
    state = reducer(state, { type: "mute" });
    expect(state.call?.participants).toEqual(["Demo teammate"]);
    expect(state.call?.digits).toBe("4");
    expect(state.call?.muted).toBe(true);
    state = reducer(state, { type: "participant", name: "Demo teammate", remove: true });
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
    const sample = { ...state.leads[0]!, id: "new", phone: "+12125550199" };
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
