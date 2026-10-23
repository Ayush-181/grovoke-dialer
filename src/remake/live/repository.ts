import type { Action, State } from "../model";
import type { Json } from "../../integrations/supabase/types";
import type { CallboardClient } from "./database";
import { durableMetadata, leadRow, type WorkspaceData } from "./mapping";

const PAGE_SIZE = 500;
export async function loadWorkspace(
  client: CallboardClient,
  workspaceId: string,
): Promise<WorkspaceData> {
  // Fetch every bounded page. A partial first page must never become an authoritative workspace snapshot.
  async function all<T>(
    table: "leads" | "dial_call_logs" | "bookings" | "calling_sessions" | "session_leads",
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error)
        throw new Error(
          `Could not load ${table.replaceAll("_", " ")}. Retry without changing records.`,
        );
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE_SIZE) return rows;
      if (offset >= 100000)
        throw new Error(
          "This workspace is too large for the current loader. No records were changed.",
        );
    }
  }
  async function readDocument() {
    const result = await client
      .from("callboard_workspace_state")
      .select("revision,data")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (result.error)
      throw new Error(
        "The Call Board database upgrade is not installed or accessible. Apply the reviewed 0007 migration before opening the redesigned workspace. No records were changed.",
      );
    return result.data;
  }
  const document = await readDocument();
  const [leads, logs, bookings, sessions, sessionLeads] = await Promise.all([
    all<WorkspaceData["leads"][number]>("leads"),
    all<WorkspaceData["logs"][number]>("dial_call_logs"),
    all<WorkspaceData["bookings"][number]>("bookings"),
    all<WorkspaceData["sessions"][number]>("calling_sessions"),
    all<WorkspaceData["sessionLeads"][number]>("session_leads"),
  ]);
  const latest = await readDocument();
  if ((latest?.revision ?? 0) !== (document?.revision ?? 0))
    throw new Error(
      "The workspace changed while it was loading. Retry to load a consistent revision; no records were changed.",
    );
  return {
    leads,
    logs,
    bookings,
    sessions,
    sessionLeads,
    document: document
      ? { revision: document.revision, data: document.data as Record<string, unknown> }
      : null,
  };
}
const changed = <T extends { id: string }>(before: T[], after: T[]) =>
  after.filter(
    (row) => JSON.stringify(row) !== JSON.stringify(before.find((old) => old.id === row.id)),
  );
export function transitionChanges(
  action: Action,
  before: State,
  after: State,
  workspaceId: string,
): Record<string, unknown> {
  const leads = changed(before.leads, after.leads)
    .filter((lead) => lead.id)
    .map((lead) => {
      const old = before.leads.find((row) => row.id === lead.id);
      const record = leadRow(lead, workspaceId);
      const previous = old ? leadRow(old, workspaceId) : {};
      const patch = Object.fromEntries(
        Object.entries(record).filter(
          ([key, value]) =>
            key !== "workspace_id" &&
            key !== "id" &&
            JSON.stringify(value) !== JSON.stringify(previous[key]),
        ),
      );
      return { id: lead.id, record, patch };
    });
  const sessions = changed(before.sessions, after.sessions).map((session) => ({
    id: session.id,
    name: session.name,
    status: { ready: "pending", running: "active", paused: "paused", stopped: "completed" }[
      session.status
    ],
    leadIds: session.leadIds,
  }));
  const logs = changed(before.logs, after.logs).map((log) => ({
    id: log.id,
    lead_id: log.leadId || null,
    session_id: log.sessionId,
    phone: log.phone,
    called_at: log.at,
    outcome: log.outcome || null,
    notes: log.notes,
    duration_seconds: log.talkSeconds ?? Math.max(0, log.seconds - (log.heldSeconds ?? 0)),
    business_name: after.leads.find((lead) => lead.id === log.leadId)?.business ?? null,
    triage_held: log.triage,
    appointment_offered: log.offered,
  }));
  return {
    leads,
    sessions,
    logs,
    deletedLeadIds:
      action.type === "deleteLeads"
        ? before.leads
            .filter((lead) => !after.leads.some((item) => item.id === lead.id))
            .map((lead) => lead.id)
        : [],
    deletedBookingIds: action.type === "deleteBooking" ? [action.id] : [],
  };
}
export async function persistTransition(
  client: CallboardClient,
  workspaceId: string,
  revision: number,
  action: Action,
  before: State,
  after: State,
): Promise<number> {
  const { data, error } = await client.rpc("save_callboard_workspace", {
    p_workspace_id: workspaceId,
    p_expected_revision: revision,
    p_document: JSON.parse(JSON.stringify(durableMetadata(after))) as Json,
    p_changes: JSON.parse(
      JSON.stringify(transitionChanges(action, before, after, workspaceId)),
    ) as Json,
  });
  if (error)
    throw new Error(
      error.code === "40001"
        ? "This workspace changed in another tab. Refresh before saving again; your local changes have not been overwritten."
        : "The change could not be saved. Your previous data has been kept. Retry or refresh.",
    );
  return data;
}
