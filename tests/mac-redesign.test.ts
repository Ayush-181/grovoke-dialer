import { describe, expect, test } from "bun:test";
import {
  activityDays,
  callingHours,
  parseDialpad,
  runway,
  suppressedNumber,
} from "../src/remake/mac-logic";
import { initialState, reducer } from "../src/remake/model";
import { readWorkspace, serializeWorkspace } from "../src/remake/state-store";

describe("Mac redesign behavior", () => {
  test("country validation rejects invalid exchanges and mismatched prefixes", () => {
    expect(parseDialpad("(512) 555-0148", "1")).toBe("+15125550148");
    expect(parseDialpad("+15125550148", "1")).toBe("+15125550148");
    expect(parseDialpad("15125550148", "1")).toBe("+15125550148");
    expect(parseDialpad("abc5125550148", "1")).toBeNull();
    expect(parseDialpad("1125550148", "1")).toBeNull();
    expect(parseDialpad("5121550148", "1")).toBeNull();
    expect(parseDialpad("9876543210", "91")).toBe("+919876543210");
    expect(parseDialpad("+919876543210", "1")).toBeNull();
    expect(parseDialpad("0712345678", "44")).toBeNull();
  });
  test("unknown calling hours stay unknown and weekends are closed", () => {
    expect(callingHours(new Date("2026-11-04T16:00:00Z"), "")).toBeNull();
    expect(callingHours(new Date("2026-11-04T16:00:00Z"), "America/Chicago")).toBe(true);
    expect(callingHours(new Date("2026-11-07T16:00:00Z"), "America/Chicago")).toBe(false);
    expect(callingHours(new Date("2026-11-04T23:00:00Z"), "America/Chicago")).toBe(false);
  });
  test("DNC applies to formatted numbers through shared suppression state", () => {
    const state = initialState();
    state.suppressedNumbers = ["+15125550148"];
    expect(suppressedNumber(state, "(512) 555-0148")).toBe(true);
    expect(suppressedNumber(state, "+15125550149")).toBe(false);
  });
  test("daily chart preserves IST boundaries and does not combine weekdays", () => {
    const state = initialState();
    const base = state.logs[0]!;
    const logs = [
      { ...base, at: "2026-11-03T18:29:00Z", outcome: "connected_dm" as const },
      { ...base, at: "2026-11-03T18:30:00Z", outcome: "connected_gk" as const },
    ];
    const days = activityDays(logs, "2026-11", 7, new Date("2026-11-04T12:00:00Z"));
    expect(days.length).toBe(7);
    expect(days.at(-1)?.dials).toBe(1);
    expect(days.at(-2)?.decisionMaker).toBe(1);
    expect(days.at(-1)?.decisionMaker).toBe(0);
  });
  test("zero spend and missing balances never imply infinite runway", () => {
    expect(runway(null, 2)).toBeNull();
    expect(runway(10, 0)).toBeNull();
    expect(runway(10, 3)).toBe(3);
    expect(runway(-1, 3)).toBe(0);
  });
  test("new preferences survive serialization", () => {
    const state = reducer(initialState(), {
      type: "preferences",
      patch: { dailyGoal: 90, bestFrom: 10, bestTo: 12, scenarioRate: 0.02, scenarioMinutes: 3 },
    });
    const saved = serializeWorkspace(state);
    expect(saved).toContain('"dailyGoal":90');
    expect(readWorkspace(saved).preferences.dailyGoal).toBe(90);
  });
});
