import { describe, expect, test } from "bun:test";
import { initialState, isDirty, reducer } from "../src/remake/model";
import { sessionElapsed } from "../src/remake/metrics";
import {
  initializeLocalWorkspace,
  LOCAL_STATE_KEY,
  readWorkspace,
  serializeWorkspace,
  snapshotData,
} from "../src/remake/state-store";

const now = Date.parse("2026-10-23T12:00:00Z");
describe("local workspace durability", () => {
  test("reload pauses a running session at the last save without counting tab-closed time", () => {
    let state = initialState();
    const id = state.sessions[0]!.id;
    state = reducer(state, { type: "startSession", id, now });
    const serialized = serializeWorkspace(state, now + 90000);
    const restored = readWorkspace(serialized, now + 3600000);
    expect(restored.activeSessionId).toBe(id);
    expect(restored.sessions[0]).toMatchObject({
      status: "paused",
      paused: true,
      elapsedMs: 90000,
      startedAt: null,
    });
    expect(sessionElapsed(restored.sessions[0]!, now + 9999999)).toBe(90000);
    expect(restored.call).toBeNull();
    expect(reducer(restored, { type: "dial", id: "paused" })).toBe(restored);
    expect(state.sessions[0]?.status).toBe("running");
  });

  test("old snapshots with running markers migrate before strict backup validation", () => {
    let state = initialState();
    state = reducer(state, { type: "startSession", id: state.sessions[0]!.id, now });
    const legacy = JSON.stringify({
      version: 1,
      savedAt: now + 45000,
      data: snapshotData(state),
      selectedId: state.selectedId,
      queueIds: state.queueIds,
      activeSessionId: state.activeSessionId,
      draft: state.draft,
      callId: null,
    });
    const restored = readWorkspace(legacy, now + 3600000);
    expect(restored.sessions[0]).toMatchObject({
      status: "paused",
      elapsedMs: 45000,
      startedAt: null,
    });
  });

  test("unsaved recovered notes remain dirty and cannot be silently lost by lead navigation", () => {
    let state = reducer(initialState(), {
      type: "dial",
      id: "recover-attempt",
      at: new Date(now).toISOString(),
    });
    state = reducer(state, { type: "tick", now: now + 12000 });
    state = reducer(state, {
      type: "edit",
      patch: { notes: "Unsaved conversation", outcome: "connected_dm" },
    });
    const restored = readWorkspace(serializeWorkspace(state, now + 12000), now + 999000);
    expect(restored.call).toMatchObject({
      id: "recover-attempt",
      active: false,
      phase: "ended",
      seconds: 12,
    });
    expect(restored.draft.notes).toBe("Unsaved conversation");
    expect(isDirty(restored)).toBe(true);
    expect(reducer(restored, { type: "select", id: "demo-1" })).toBe(restored);
    const saved = reducer(restored, { type: "save", now });
    expect(saved.logs[0]?.notes).toBe("Unsaved conversation");
    expect(saved.logs[0]?.outcome).toBe("connected_dm");
    expect(isDirty(saved)).toBe(false);
    expect(saved.logs.filter((log) => log.id === "recover-attempt")).toHaveLength(1);
  });

  test("fresh-attempt field clearing does not become an unsaved draft on reload", () => {
    let state = reducer(initialState(), { type: "select", id: "demo-1" });
    state = reducer(state, {
      type: "dial",
      id: "new-blank-attempt",
      at: new Date(now).toISOString(),
    });
    const restored = readWorkspace(serializeWorkspace(state, now), now + 60000);
    expect(restored.draft.outcome).toBe("");
    expect(restored.draft.triage).toBe(false);
    expect(isDirty(restored)).toBe(false);
  });

  test("recovering an existing callback does not count it again on the new attempt", () => {
    let state = reducer(initialState(), { type: "select", id: "demo-4" });
    state = reducer(state, { type: "dial", id: "callback-retry", at: new Date(now).toISOString() });
    let restored = readWorkspace(serializeWorkspace(state, now), now + 1000);
    restored = reducer(restored, { type: "edit", patch: { outcome: "no_answer" } });
    restored = reducer(restored, { type: "save", now });
    expect(restored.logs[0]?.callback).toBe(false);
  });

  test("queue restoration removes deleted, invalid and duplicate identities", () => {
    const state = initialState();
    const raw = JSON.parse(serializeWorkspace(state, now));
    raw.queueIds = ["missing", "demo-0", "demo-0", 7, "demo-2"];
    raw.selectedId = "missing";
    raw.activeSessionId = "missing";
    const restored = readWorkspace(JSON.stringify(raw), now);
    expect(restored.queueIds).toEqual(["demo-0", "demo-2"]);
    expect(restored.selectedId).toBe("demo-0");
    expect(restored.activeSessionId).toBeNull();
  });

  test("restoring an intentionally empty workspace does not add synthetic records", () => {
    const state = reducer(initialState(), {
      type: "deleteLeads",
      ids: initialState().leads.map((lead) => lead.id),
    });
    const restored = readWorkspace(serializeWorkspace(state, now), now + 1000);
    expect(restored.leads).toEqual([]);
    expect(restored.selectedId).toBe("");
    expect(restored.draft.id).toBe("");
    expect(isDirty(restored)).toBe(false);
  });

  test("corrupt or oversized saves return a visible recovery error without any storage mutation", () => {
    const storage = {
      getItem(key: string) {
        expect(key).toBe(LOCAL_STATE_KEY);
        return "{broken";
      },
    };
    const result = initializeLocalWorkspace(storage);
    expect(result.error).toContain("kept");
    expect(result.error).toContain("will not overwrite");
    expect(() => readWorkspace(" ".repeat(10 * 1024 * 1024 + 1))).toThrow("too large");
    expect(() => readWorkspace(JSON.stringify({ version: 7, savedAt: now }))).toThrow(
      "unsupported",
    );
  });
});
