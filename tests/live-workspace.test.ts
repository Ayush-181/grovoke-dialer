import { describe, expect, test } from "bun:test";
import type { Tables } from "../src/integrations/supabase/types";
import { initialState, reducer, type Lead, type State } from "../src/remake/model";
import { metrics } from "../src/remake/metrics";
import {
  durableMetadata,
  leadRow,
  mapLead,
  stateFromWorkspace,
  type WorkspaceData,
} from "../src/remake/live/mapping";
import { transitionChanges } from "../src/remake/live/repository";
import { makeBackup, parseBackup } from "../src/remake/data-tools";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const at = "2026-10-23T12:00:00Z";
const identity = {
  name: "Ash",
  email: "ash@example.invalid",
  workspaceName: "Synthetic workspace",
};
function leadDb(lead: Lead): Tables<"leads"> {
  return {
    address: null,
    call_count: lead.calls,
    created_at: at,
    last_called_at: null,
    state: "NY",
    status: "new",
    updated_at: at,
    zip: null,
    ...leadRow(lead, workspaceId),
  } as Tables<"leads">;
}
function rowsFor(state: State): WorkspaceData {
  return {
    leads: state.leads.map(leadDb),
    logs: state.logs.map((log) => ({
      id: log.id,
      workspace_id: workspaceId,
      user_id: userId,
      lead_id: log.leadId || null,
      session_id: log.sessionId,
      phone: log.phone,
      called_at: log.at,
      created_at: at,
      updated_at: at,
      direction: "outbound",
      duration_seconds: log.talkSeconds ?? Math.max(0, log.seconds - (log.heldSeconds ?? 0)),
      outcome: log.outcome || null,
      notes: log.notes,
      business_name: null,
      call_sid: null,
      recording_url: null,
      transcript: null,
      missed_call_acknowledged: false,
      triage_held: log.triage,
      appointment_offered: log.offered,
    })),
    bookings: state.bookings.map((booking) => ({
      id: booking.id,
      workspace_id: workspaceId,
      created_by: userId,
      lead_id: booking.leadId || null,
      title: booking.title,
      starts_at: booking.at,
      ends_at: new Date(Date.parse(booking.at) + booking.duration * 60000).toISOString(),
      attendees: booking.guests
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      add_meet: booking.meet,
      notes: booking.notes,
      lead_timezone: booking.zone,
      created_at: at,
      delivery_method: "google_calendar",
      email_delivery_status: "sent",
      gmail_message_id: null,
      google_account_email: "ash@example.invalid",
      google_event_id: "synthetic-event",
      google_event_url: null,
      invite_from: null,
      location: "",
      meet_url: null,
      status: "confirmed",
    })),
    sessions: state.sessions.map((session) => ({
      id: session.id,
      workspace_id: workspaceId,
      created_by: userId,
      created_at: at,
      updated_at: at,
      name: session.name,
      status: (
        { ready: "pending", running: "active", paused: "paused", stopped: "completed" } as const
      )[session.status],
      completed_leads: 0,
      total_leads: session.leadIds.length,
      filters_json: {},
    })),
    sessionLeads: state.sessions.flatMap((session) =>
      session.leadIds.map((leadId, index) => ({
        id: `${session.id}-queue-${index}`,
        workspace_id: workspaceId,
        session_id: session.id,
        lead_id: leadId,
        phone_normalized: state.leads.find((lead) => lead.id === leadId)?.phone ?? "",
        queue_position: index,
        status: "queued" as const,
        outcome: null,
        created_at: at,
      })),
    ),
    document: { revision: 2, data: JSON.parse(JSON.stringify(durableMetadata(state))) },
  };
}

describe("live workspace mapping with synthetic database rows", () => {
  test("an empty authorized workspace receives no synthetic CRM records", () => {
    const rows: WorkspaceData = {
      leads: [],
      logs: [],
      bookings: [],
      sessions: [],
      sessionLeads: [],
      document: null,
    };
    const state = stateFromWorkspace(rows, identity);
    expect(state.leads).toEqual([]);
    expect(state.logs).toEqual([]);
    expect(state.bookings).toEqual([]);
    expect(state.sessions).toEqual([]);
    expect(state.followUps).toEqual([]);
    expect(state.queueIds).toEqual([]);
    expect(state.selectedId).toBe("");
    expect(state.draft.business).toBe("");
    expect(state.call).toBeNull();
    expect(state.preferences.email).toBe(identity.email);
  });

  test("legacy rows derive safe defaults without replacing source notes, outcomes or counters", () => {
    const row = leadDb(initialState().leads[0]!);
    row.metadata_json = { existing: "unrelated metadata" };
    row.call_count = 23;
    row.outcome = "not_interested";
    row.notes = "Original source research";
    const lead = mapLead(row);
    expect(lead).toMatchObject({
      business: row.business_name,
      notes: row.notes,
      calls: 23,
      outcome: "not_interested",
      zone: "America/New_York",
      category: "Business",
    });
    expect(metrics([{ ...initialState().logs[0]!, outcome: lead.outcome }]).connected).toBe(1);
  });

  test("per-lead metadata retains contacts, custom fields and the repeated-time callback choice", () => {
    const lead = {
      ...initialState().leads[0]!,
      callback: true,
      callbackAt: "2026-11-01T01:30",
      callbackOccurrence: 1,
      callbackReason: "Requested",
      suppressed: true,
      stageId: "dnc",
      customValues: { score: 7, research: "Needs evening calls" },
    };
    const row = leadDb(lead);
    const mapped = mapLead(row);
    expect(mapped.contacts).toEqual(lead.contacts);
    expect(mapped.customValues).toEqual(lead.customValues);
    expect(mapped.callbackOccurrence).toBe(1);
    expect(mapped.stageId).toBe("dnc");
    expect(mapped.suppressed).toBe(true);
    const record = leadRow({ ...lead, phone: "(212) 555-0100" }, workspaceId);
    expect(record["phone_normalized"]).toBe("+12125550100");
    expect(record).not.toHaveProperty("call_count");
    expect(record).not.toHaveProperty("status");
  });

  test("metadata roundtrip preserves measured call time, milestones, group participants and booking linkage", () => {
    let state = reducer(initialState(), {
      type: "dial",
      id: "synthetic-call",
      at,
      phase: "connecting",
    });
    state = reducer(state, { type: "tick", now: Date.parse(at) + 5000 });
    state = reducer(state, { type: "answer", at: "2026-10-23T12:00:05Z" });
    state = reducer(state, { type: "tick", now: Date.parse(at) + 25000 });
    state = reducer(state, {
      type: "participant",
      phone: "+12125550199",
      name: "Second decision maker",
    });
    state = reducer(state, { type: "hold" });
    state = reducer(state, { type: "tick", now: Date.parse(at) + 30000 });
    state = reducer(state, { type: "milestone", kind: "triage", enabled: true });
    state = reducer(state, {
      type: "booking",
      booking: {
        ...state.bookings[0]!,
        id: "roundtrip-booking",
        leadId: state.selectedId,
        originatingCallId: "synthetic-call",
      },
    });
    state = reducer(state, { type: "end", at: "2026-10-23T12:00:30Z" });
    state = reducer(state, { type: "save" });
    const restored = stateFromWorkspace(rowsFor(state), identity);
    expect(restored.logs[0]).toMatchObject({
      id: "synthetic-call",
      seconds: 30,
      talkSeconds: 20,
      ringingSeconds: 5,
      heldSeconds: 5,
      booked: true,
      triage: true,
      outcome: "appointment_set",
      participants: [{ phone: "+12125550199", name: "Second decision maker" }],
      bookingIds: ["roundtrip-booking"],
    });
    expect(metrics(restored.logs)).toEqual(metrics(state.logs));
    expect(restored.bookings.at(-1)?.originatingCallId).toBe("synthetic-call");
    expect(restored.call).toBeNull();
  });

  test("DNC remains effective after roundtrip and subsequent record removal", () => {
    const state = initialState();
    state.suppressedNumbers.push("+12125550199");
    let restored = stateFromWorkspace(rowsFor(state), identity);
    expect(restored.suppressedNumbers).toContain("+12125550199");
    restored = reducer(restored, { type: "deleteLeads", ids: ["demo-6"] });
    for (const phone of ["212-555-0106", "212-555-0199"])
      expect(
        reducer(restored, {
          type: "manualDial",
          id: "forbidden",
          leadId: "unused",
          phone,
          name: "",
          at,
        }),
      ).toBe(restored);
  });

  test("workspace configuration, follow-ups and import audit metadata survive source hydration", () => {
    const state = initialState();
    state.customFields = [
      { id: "budget", label: "Budget", type: "number", options: [], showInTable: true },
    ];
    state.leads[0]!.customValues = { budget: 500 };
    state.followUps = [
      {
        id: "planned-followup",
        leadId: state.leads[0]!.id,
        at: "2099-10-23T12:00:00Z",
        zone: "America/New_York",
        reason: "Requested",
        status: "pending",
      },
    ];
    state.importBatches = [{ id: "import-audit", at, added: 2, updated: 1, skipped: 3 }];
    state.recordingEnabled = true;
    const restored = stateFromWorkspace(rowsFor(state), identity);
    for (const key of [
      "customFields",
      "templates",
      "stages",
      "followUps",
      "importBatches",
      "recordingEnabled",
    ] as const)
      expect(restored[key]).toEqual(state[key]);
    expect(restored.leads[0]?.customValues).toEqual({ budget: 500 });
  });

  test("queue positions sort independently of source row order and active sessions reload paused", () => {
    const state = initialState();
    state.sessions[0] = {
      ...state.sessions[0]!,
      status: "running",
      paused: false,
      startedAt: null,
      elapsedMs: 120000,
    };
    const rows = rowsFor(state);
    rows.sessionLeads.reverse();
    const restored = stateFromWorkspace(rows, identity);
    expect(restored.sessions[0]).toMatchObject({
      status: "paused",
      paused: true,
      elapsedMs: 120000,
      startedAt: null,
      leadIds: state.sessions[0]!.leadIds,
    });
    expect(restored.activeSessionId).toBeNull();
  });

  test("archived database rows with NULL lead_id remain available to portable backups", () => {
    const state = initialState();
    const rows = rowsFor(state);
    rows.logs[0]!.lead_id = null;
    rows.bookings[0]!.lead_id = null;
    const restored = stateFromWorkspace(rows, identity);
    const backup = parseBackup(JSON.stringify(makeBackup(restored)));
    expect(backup.data.logs[0]?.leadId).toBe("");
    expect(backup.data.bookings[0]?.leadId).toBe("");
  });
});

describe("minimal persistence transitions", () => {
  test("a call writes one log but does not assign browser call_count back into the database", () => {
    const before = initialState();
    const after = reducer(before, { type: "dial", id: "single-attempt", at });
    const changes = transitionChanges(
      { type: "dial", id: "single-attempt", at },
      before,
      after,
      workspaceId,
    );
    expect(changes["logs"]).toEqual([
      expect.objectContaining({
        id: "single-attempt",
        lead_id: before.selectedId,
        duration_seconds: 0,
      }),
    ]);
    expect(changes["leads"]).toEqual([
      expect.objectContaining({ id: before.selectedId, patch: {} }),
    ]);
    expect(JSON.stringify(changes)).not.toContain("call_count");
    expect(changes["deletedLeadIds"]).toEqual([]);
    expect(changes["deletedBookingIds"]).toEqual([]);
  });

  test("editing one lead sends only changed source columns and never unrelated records or deletions", () => {
    const before = initialState();
    const after = {
      ...before,
      leads: before.leads.map((lead, i) => (i === 0 ? { ...lead, notes: "New saved note" } : lead)),
    };
    const changes = transitionChanges(
      { type: "updateLead", lead: after.leads[0]! },
      before,
      after,
      workspaceId,
    );
    expect(changes["leads"]).toEqual([
      expect.objectContaining({ id: before.leads[0]!.id, patch: { notes: "New saved note" } }),
    ]);
    expect(changes["logs"]).toEqual([]);
    expect(changes["sessions"]).toEqual([]);
    expect(changes["deletedLeadIds"]).toEqual([]);
    expect(changes["deletedBookingIds"]).toEqual([]);
  });

  test("record-only booking deletion cannot delete calls or leads", () => {
    const before = initialState();
    const action = { type: "deleteBooking" as const, id: before.bookings[0]!.id };
    const after = reducer(before, action);
    const changes = transitionChanges(action, before, after, workspaceId);
    expect(changes["deletedBookingIds"]).toEqual([action.id]);
    expect(changes["deletedLeadIds"]).toEqual([]);
    expect(changes["leads"]).toEqual([]);
    expect(changes["logs"]).toEqual([]);
  });

  test("explicit lead deletion preserves attempt history and patches only its affected queue", () => {
    const before = initialState();
    before.sessions[0] = {
      ...before.sessions[0]!,
      leadIds: [...before.sessions[0]!.leadIds, "demo-1"],
    };
    const action = { type: "deleteLeads" as const, ids: ["demo-1"] };
    const after = reducer(before, action);
    const changes = transitionChanges(action, before, after, workspaceId);
    expect(changes["deletedLeadIds"]).toEqual(["demo-1"]);
    expect(changes["logs"]).toEqual([]);
    expect(changes["deletedBookingIds"]).toEqual([]);
    expect(changes["sessions"]).toEqual([
      expect.objectContaining({
        id: before.sessions[0]!.id,
        leadIds: before.sessions[0]!.leadIds.filter((id) => id !== "demo-1"),
      }),
    ]);
    expect(after.logs).toEqual(before.logs);
  });

  test("duration writes conversation time while detailed elapsed time stays in additive metadata", () => {
    const before = reducer(initialState(), { type: "dial", id: "duration-call", at });
    const after = reducer(before, {
      type: "providerTime",
      id: "duration-call",
      seconds: 30,
      talkSeconds: 18,
      heldSeconds: 7,
    });
    const changes = transitionChanges(
      { type: "providerTime", id: "duration-call", seconds: 30, talkSeconds: 18, heldSeconds: 7 },
      before,
      after,
      workspaceId,
    );
    expect(changes["logs"]).toEqual([
      expect.objectContaining({ id: "duration-call", duration_seconds: 18 }),
    ]);
    const extras = durableMetadata(after)["logExtras"] as Record<string, unknown>;
    expect(extras["duration-call"]).toMatchObject({
      seconds: 30,
      talkSeconds: 18,
      heldSeconds: 7,
      ringingSeconds: 5,
    });
  });
});

test("workspace defaults are selected for the signed-in user", () => {
  const rows = rowsFor(initialState());
  rows.document = {
    revision: 4,
    data: {
      userSettings: {
        [userId]: {
          preferences: { displayName: "Own display name", microphone: "own-mic" },
          recordingEnabled: true,
        },
        other: {
          preferences: { displayName: "Another member", microphone: "other-mic" },
          recordingEnabled: false,
        },
      },
    },
  };
  const state = stateFromWorkspace(rows, { ...identity, userId });
  expect(state.preferences.displayName).toBe("Own display name");
  expect(state.preferences.microphone).toBe("own-mic");
  expect(state.recordingEnabled).toBe(true);
  const other = stateFromWorkspace(rows, { ...identity, userId: "unconfigured-member" });
  expect(other.preferences.displayName).toBe(identity.name);
  expect(other.preferences.microphone).toBe("default");
});
