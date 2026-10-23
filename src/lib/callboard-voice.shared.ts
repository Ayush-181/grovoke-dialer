export function conferenceName(workspaceId: string, attemptId: string) {
  return `cb_${workspaceId.replaceAll("-", "")}_${attemptId.replaceAll("-", "")}`;
}
export const TERMINAL_CALL_STATES = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);
export type StoredVoiceLeg = {
  phone: string;
  sid: string;
  primary: boolean;
  label?: string;
  generation?: number;
};
export type VoiceLeg = {
  phone: string;
  label: string;
  callSid: string;
  status: string;
  durationSeconds: number;
  held: boolean;
  primary?: boolean;
};
export type VoiceResult = { legs: VoiceLeg[]; ended: boolean };
export type VoiceControl = {
  operation: "add" | "state" | "hold" | "remove" | "end";
  phone?: string;
  held?: boolean;
  primary?: boolean;
};
export type VoiceControlPorts = {
  request: <T>(path: string, values?: Record<string, string>) => Promise<T>;
  saveLegs: (legs: StoredVoiceLeg[]) => Promise<void>;
  markEnded: () => Promise<void>;
};
type ProviderCall = { status: string; duration?: string };
type ProviderParticipant = { call_sid: string; label?: string; hold?: boolean };
const legLabel = (leg: StoredVoiceLeg) => leg.label ?? `leg_${leg.phone.replace(/\D/g, "")}`;
/** Provider operations use explicit injected ports so unit tests never contact a service. */
export async function controlConference(
  input: VoiceControl,
  stored: StoredVoiceLeg[],
  conferenceSid: string | null,
  callerId: string,
  ports: VoiceControlPorts,
): Promise<VoiceResult> {
  let legs = stored.map((leg) => ({ ...leg }));
  const path = `/Conferences/${encodeURIComponent(conferenceSid ?? "")}`;
  const callPath = (leg: StoredVoiceLeg) => `/Calls/${encodeURIComponent(leg.sid)}.json`;
  const calls = new Map<string, ProviderCall>();
  const loadCall = async (leg: StoredVoiceLeg) => {
    let value = calls.get(leg.sid);
    if (!value) {
      value = await ports.request<ProviderCall>(callPath(leg));
      calls.set(leg.sid, value);
    }
    return value;
  };
  async function stopLeg(leg: StoredVoiceLeg): Promise<void> {
    const current = await ports.request<ProviderCall>(callPath(leg));
    if (TERMINAL_CALL_STATES.has(current.status)) return;
    try {
      await ports.request(callPath(leg), {
        Status: current.status === "in-progress" ? "completed" : "canceled",
      });
    } catch (error) {
      // Another leg can complete the room while this request is in flight.
      const latest = await ports.request<ProviderCall>(callPath(leg));
      if (!TERMINAL_CALL_STATES.has(latest.status)) throw error;
    }
    calls.delete(leg.sid);
  }
  async function terminate(): Promise<void> {
    // Ringing outbound legs may not have entered the conference yet.
    for (const leg of legs) {
      await stopLeg(leg);
    }
    if (conferenceSid) {
      try {
        await ports.request(`${path}.json`, { Status: "completed" });
      } catch (error) {
        const conference = await ports.request<{ status: string }>(`${path}.json`);
        if (conference.status !== "completed") throw error;
      }
    }
    await ports.markEnded();
  }
  if (input.operation === "end") {
    await terminate();
    return { legs: [], ended: true };
  }
  if (input.operation === "add") {
    if (!input.phone) throw new Error("Enter a valid destination number.");
    const primary = legs.find((leg) => leg.primary);
    if (input.primary && primary && primary.phone !== input.phone)
      throw new Error("This attempt already has its primary contact.");
    if (!input.primary && !primary)
      throw new Error("Connect the primary contact before adding another number.");
    if (primary && !input.primary && (await loadCall(primary)).status !== "in-progress")
      throw new Error("Wait for the primary contact to answer before adding another number.");
    const target = legs.find((leg) => leg.phone === input.phone);
    const targetState = target ? await loadCall(target) : null;
    if (target && target.primary && targetState && TERMINAL_CALL_STATES.has(targetState.status))
      throw new Error("This call has ended. Start a new attempt to redial.");
    if (!target || (targetState && TERMINAL_CALL_STATES.has(targetState.status))) {
      const active = (await Promise.all(legs.map(loadCall))).filter(
        (value) => !TERMINAL_CALL_STATES.has(value.status),
      ).length;
      if (active >= 11) throw new Error("This call already has ten additional contacts.");
      if (!target && legs.length >= 100)
        throw new Error("Start a new call before adding more destinations.");
      const generation = (target?.generation ?? (target ? 1 : 0)) + 1;
      const label = `leg_${input.phone.replace(/\D/g, "")}${generation > 1 ? `_${generation}` : ""}`;
      const participants = await ports.request<{ participants: ProviderParticipant[] }>(
        `${path}/Participants.json?PageSize=100`,
      );
      if (
        !input.primary &&
        participants.participants.some(
          (participant) => participant.call_sid === primary?.sid && participant.hold,
        )
      )
        throw new Error("Resume the call before adding another contact.");
      const existing = participants.participants.find((participant) => participant.label === label);
      const created =
        existing ??
        (await ports.request<{ call_sid: string }>(`${path}/Participants.json`, {
          From: callerId,
          To: input.phone,
          Label: label,
          StartConferenceOnEnter: "true",
          EndConferenceOnExit: input.primary ? "true" : "false",
          Timeout: "30",
          EarlyMedia: "false",
        }));
      const next: StoredVoiceLeg = {
        phone: input.phone,
        sid: created.call_sid,
        primary: Boolean(input.primary),
        label,
        generation,
      };
      legs = [...legs.filter((leg) => leg.phone !== input.phone), next];
      await ports.saveLegs(legs);
    }
  }
  const target = legs.find((leg) => leg.phone === input.phone);
  if (input.operation === "remove") {
    if (!target || target.primary) throw new Error("Only an added contact can be removed.");
    await stopLeg(target);
  }
  if (input.operation === "hold") {
    if (typeof input.held !== "boolean")
      throw new Error("Choose whether to hold or resume the call.");
    if (input.phone && !target) throw new Error("This contact is not part of the call.");
    const primary = legs.find((leg) => leg.primary);
    if (!primary || (await loadCall(primary)).status !== "in-progress")
      throw new Error("Wait for the primary contact to answer.");
    for (const leg of input.phone ? [target!] : legs) {
      if ((await loadCall(leg)).status === "in-progress")
        await ports.request(`${path}/Participants/${encodeURIComponent(leg.sid)}.json`, {
          Hold: String(input.held),
        });
    }
  }
  const participants = await ports.request<{ participants: ProviderParticipant[] }>(
    `${path}/Participants.json?PageSize=100`,
  );
  const result = await Promise.all(
    legs.map(async (leg) => {
      const state = await loadCall(leg);
      const duration = Number(state.duration ?? 0);
      return {
        phone: leg.phone,
        label: legLabel(leg),
        callSid: leg.sid,
        status: state.status,
        durationSeconds: Number.isFinite(duration) ? Math.max(0, duration) : 0,
        held:
          participants.participants.find((participant) => participant.call_sid === leg.sid)?.hold ??
          false,
        primary: leg.primary,
      };
    }),
  );
  const ended = result.some((leg) => leg.primary && TERMINAL_CALL_STATES.has(leg.status));
  if (ended) await terminate();
  return { legs: result, ended };
}
export type VoiceClock = {
  started: number;
  answered: number | null;
  heldMs: number;
  heldSince: number | null;
};
export function voiceClock(current: VoiceClock, now: number) {
  const seconds = Math.max(0, Math.floor((now - current.started) / 1000));
  const conversationMs = current.answered === null ? 0 : Math.max(0, now - current.answered);
  const heldMs = Math.min(
    conversationMs,
    Math.max(0, current.heldMs + (current.heldSince === null ? 0 : now - current.heldSince)),
  );
  return {
    seconds,
    talkSeconds: Math.floor((conversationMs - heldMs) / 1000),
    heldSeconds: Math.floor(heldMs / 1000),
  };
}
