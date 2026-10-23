import { initialState, emptyLead, type State, type DataSnapshot, type Lead } from "./model";
import { validateSnapshot } from "./data-tools";

export const LOCAL_STATE_KEY = "callboard-workspace-v1";
const DATA_KEYS = [
  "preferences",
  "recordingEnabled",
  "leads",
  "logs",
  "bookings",
  "sessions",
  "templates",
  "stages",
  "customFields",
  "followUps",
  "importBatches",
  "suppressedNumbers",
] as const;
export function snapshotData(state: State): DataSnapshot {
  return Object.fromEntries(DATA_KEYS.map((key) => [key, state[key]])) as DataSnapshot;
}
export function serializeWorkspace(state: State, now = Date.now()): string {
  const data = snapshotData(state);
  // Persist measured session time, excluding any future time while the tab is closed.
  const sessions = data.sessions.map((session) =>
    session.status === "running"
      ? {
          ...session,
          status: "paused" as const,
          paused: true,
          elapsedMs:
            session.elapsedMs +
            (session.startedAt === null ? 0 : Math.max(0, now - session.startedAt)),
          startedAt: null,
        }
      : session,
  );
  return JSON.stringify({
    version: 1,
    savedAt: now,
    data: { ...data, sessions },
    selectedId: state.selectedId,
    queueIds: state.queueIds,
    activeSessionId: state.activeSessionId,
    draft: state.draft,
    callId: state.call?.id ?? null,
    callBaseline: state.call?.draftBaseline ?? null,
    callbackAtStart: state.call?.callbackAtStart,
  });
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function readWorkspace(serialized: string, now = Date.now()): State {
  if (serialized.length > 10 * 1024 * 1024)
    throw new Error("The saved workspace is too large to restore safely. Use a validated backup.");
  const raw: unknown = JSON.parse(serialized);
  if (
    !object(raw) ||
    raw["version"] !== 1 ||
    typeof raw["savedAt"] !== "number" ||
    !Number.isFinite(raw["savedAt"])
  )
    throw new Error("Saved workspace format is unsupported.");
  let storedData = raw["data"];
  // Older local snapshots contained live session markers. Normalize them before
  // applying the backup schema, which deliberately accepts paused sessions only.
  if (object(storedData) && Array.isArray(storedData["sessions"])) {
    storedData = {
      ...storedData,
      sessions: storedData["sessions"].map((session: unknown) => {
        if (
          !object(session) ||
          session["status"] !== "running" ||
          typeof session["elapsedMs"] !== "number" ||
          !Number.isFinite(session["elapsedMs"]) ||
          (session["startedAt"] !== null &&
            (typeof session["startedAt"] !== "number" || !Number.isFinite(session["startedAt"])))
        )
          return session;
        const extra =
          session["startedAt"] === null
            ? 0
            : Math.max(0, Math.min(now, raw["savedAt"] as number) - session["startedAt"]);
        return {
          ...session,
          status: "paused",
          paused: true,
          elapsedMs: session["elapsedMs"] + extra,
          startedAt: null,
        };
      }),
    };
  }
  const data = validateSnapshot(storedData);
  const validIds = new Set(data.leads.map((lead) => lead.id));
  const selected = data.leads.find((lead) => lead.id === raw["selectedId"]) ?? data.leads[0];
  function readDraft(value: unknown): Lead | undefined {
    if (!selected || !object(value) || value["id"] !== selected.id) return undefined;
    const candidate = validateSnapshot({
      ...data,
      leads: data.leads.map((lead) => (lead.id === selected.id ? value : lead)),
    });
    return candidate.leads.find((lead) => lead.id === selected.id);
  }
  const draft = readDraft(raw["draft"]) ?? selected ?? emptyLead();
  const priorLog = data.logs.find((log) => log.id === raw["callId"] && log.leadId === selected?.id);
  const baseline = priorLog ? (readDraft(raw["callBaseline"]) ?? selected) : undefined;
  const recoveredCall: State["call"] = priorLog
    ? {
        id: priorLog.id,
        leadId: priorLog.leadId,
        phone: priorLog.phone,
        at: priorLog.at,
        active: false,
        phase: "ended",
        seconds: priorLog.seconds,
        talkSeconds:
          priorLog.talkSeconds ?? Math.max(0, priorLog.seconds - (priorLog.heldSeconds ?? 0)),
        ringingSeconds: priorLog.ringingSeconds ?? 0,
        muted: false,
        held: false,
        heldSeconds: priorLog.heldSeconds ?? 0,
        recording: priorLog.recording,
        participants: priorLog.participants,
        digits: "",
        ...(priorLog.answeredAt ? { answeredAt: priorLog.answeredAt } : {}),
        ...(priorLog.endedAt ? { endedAt: priorLog.endedAt } : {}),
        ...(baseline ? { draftBaseline: baseline } : {}),
        callbackAtStart:
          typeof raw["callbackAtStart"] === "boolean"
            ? raw["callbackAtStart"]
            : (baseline?.callback ?? false),
      }
    : null;
  const sessions = data.sessions;
  return {
    ...initialState(),
    ...data,
    sessions,
    selectedId: selected?.id ?? "",
    draft,
    queueIds: Array.isArray(raw["queueIds"])
      ? [
          ...new Set(
            raw["queueIds"].filter(
              (id): id is string => typeof id === "string" && validIds.has(id),
            ),
          ),
        ]
      : [...validIds],
    activeSessionId: sessions.some(
      (session) => session.id === raw["activeSessionId"] && session.status === "paused",
    )
      ? (raw["activeSessionId"] as string)
      : null,
    call: recoveredCall,
    queueComplete: false,
  };
}
export function initializeLocalWorkspace(storage?: Pick<Storage, "getItem">): {
  state: State;
  error: string;
} {
  try {
    const saved = storage?.getItem(LOCAL_STATE_KEY);
    return { state: saved ? readWorkspace(saved) : initialState(), error: "" };
  } catch {
    return {
      state: initialState(),
      error:
        "Saved data could not be loaded. The saved copy has been kept; new changes will not overwrite it. Restore a validated backup from Data to continue saving.",
    };
  }
}
