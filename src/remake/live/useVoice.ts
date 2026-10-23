import { useCallback, useEffect, useRef, useState } from "react";
import { Device, type Call as TwilioCall } from "@twilio/voice-sdk";
import { getVoiceToken } from "../../lib/twilio.functions";
import {
  callboardVoiceCommand,
  type VoiceCommand,
  type VoiceResult,
} from "../../lib/callboard-voice.functions";
import { voiceClock } from "../../lib/callboard-voice.shared";
import type { ProviderSnapshot } from "../runtime";

const initial: ProviderSnapshot = {
  phase: "offline",
  seconds: 0,
  talkSeconds: 0,
  heldSeconds: 0,
  muted: false,
  legs: [],
};
type Attempt = {
  id: string;
  phone: string;
  record: boolean;
  started: number;
  answered: number | null;
  heldMs: number;
  heldSince: number | null;
  joined: boolean;
  ended: boolean;
  accepting: boolean;
  closing: boolean;
};
/** No microphone, registration or provider operations occur until an explicit user action. */
export function useCallboardVoice(workspaceId: string) {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot>(initial);
  const [ready, setReady] = useState(false);
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const device = useRef<Device | null>(null),
    call = useRef<TwilioCall | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const alive = useRef(true),
    polling = useRef<Attempt | null>(null),
    connecting = useRef(false),
    epoch = useRef(0);
  const publish = useCallback((patch: Partial<ProviderSnapshot>) => {
    if (alive.current) setSnapshot((previous) => ({ ...previous, ...patch }));
  }, []);
  const finish = useCallback(
    (current: Attempt, error?: string) => {
      if (attempt.current !== current || current.ended) return;
      current.ended = true;
      publish({
        ...voiceClock(current, Date.now()),
        phase: "ended",
        held: false,
        recording: false,
        legs: [],
        ...(error ? { error } : {}),
      });
      const previous = call.current;
      // Clear first: SDK disconnect callbacks can synchronously re-enter this function.
      call.current = null;
      previous?.disconnect();
    },
    [publish],
  );
  const command = useCallback(
    (data: Omit<VoiceCommand, "workspaceId" | "attemptId">, current: Attempt) => {
      if (attempt.current !== current || current.ended) throw new Error("This call has ended.");
      return callboardVoiceCommand({ data: { ...data, workspaceId, attemptId: current.id } });
    },
    [workspaceId],
  );
  const update = useCallback(
    (result: VoiceResult, current: Attempt) => {
      if (attempt.current !== current || current.ended) return;
      const now = Date.now();
      const primary = result.legs.find((leg) => leg.primary);
      if (
        current.answered === null &&
        (primary?.status === "in-progress" ||
          (primary?.status === "completed" && primary.durationSeconds > 0))
      )
        current.answered = Math.max(current.started, now - (primary.durationSeconds || 0) * 1000);
      // Reflect confirmed provider hold state, including a partially failed hold command.
      const held = primary?.held === true && current.answered !== null;
      if (held && current.heldSince === null) current.heldSince = now;
      if (!held && current.heldSince !== null) {
        current.heldMs += Math.max(0, now - current.heldSince);
        current.heldSince = null;
      }
      if (result.ended) {
        finish(current);
        return;
      }
      publish({
        ...voiceClock(current, now),
        phase: current.answered === null ? "connecting" : "live",
        phone: current.phone,
        held,
        recording: current.record && current.joined,
        legs: result.legs.map((leg) => ({ phone: leg.phone, status: leg.status })),
      });
    },
    [finish, publish],
  );
  const disconnected = useCallback(
    async (current: Attempt, error?: string) => {
      if (attempt.current !== current || current.ended || current.closing) return;
      current.closing = true;
      const previous = call.current;
      call.current = null;
      previous?.disconnect();
      try {
        // Closing browser audio alone may leave a REST-created prospect leg ringing.
        if (current.joined || current.accepting) await command({ operation: "end" }, current);
        finish(current, error);
      } catch {
        if (attempt.current !== current || current.ended) return;
        current.closing = false;
        publish({
          error:
            "Browser audio disconnected, but the provider could not confirm the hangup. Use End call again before dialing another number.",
        });
      }
    },
    [command, finish, publish],
  );
  useEffect(() => {
    alive.current = true;
    const generation = epoch.current;
    setReady(false);
    setInputs([]);
    setSelectedInput(null);
    publish(initial);
    const timer = setInterval(() => {
      const current = attempt.current;
      if (!current?.joined || current.ended || current.closing || polling.current) return;
      polling.current = current;
      void command({ operation: "state" }, current)
        .then((result) => update(result, current))
        .catch(() => {
          if (attempt.current === current && !current.ended)
            publish({
              error: "Call status could not be refreshed. Use End call if the connection is lost.",
            });
        })
        .finally(() => {
          if (polling.current === current) polling.current = null;
        });
    }, 1000);
    return () => {
      alive.current = false;
      epoch.current = generation + 1;
      connecting.current = false;
      clearInterval(timer);
      const previous = call.current;
      call.current = null;
      const current = attempt.current;
      if (current && !current.ended && (current.joined || current.accepting)) {
        void callboardVoiceCommand({
          data: { workspaceId, attemptId: current.id, operation: "end" },
        }).catch(() => {
          // Browser audio closure also ends its conference; a closing tab cannot display errors.
        });
      }
      if (current) current.ended = true;
      attempt.current = null;
      polling.current = null;
      previous?.disconnect();
      device.current?.destroy();
      device.current = null;
    };
  }, [command, publish, update, workspaceId]);
  const refreshInputs = useCallback(() => {
    const available: { id: string; label: string }[] = [];
    device.current?.audio?.availableInputDevices.forEach((info, id) =>
      available.push({ id, label: info.label || `Microphone ${available.length + 1}` }),
    );
    if (alive.current) setInputs(available);
  }, []);
  const connect = useCallback(async () => {
    if (connecting.current || (device.current && ready)) return;
    if (call.current || (attempt.current && !attempt.current.ended))
      throw new Error("End the current call before reconnecting.");
    device.current?.destroy();
    device.current = null;
    connecting.current = true;
    const generation = epoch.current;
    const isCurrent = () => alive.current && epoch.current === generation;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      media.getTracks().forEach((track) => track.stop());
      if (!isCurrent()) return;
      const token = await getVoiceToken({ data: { workspaceId } });
      if (!isCurrent()) return;
      if (!token.ok) throw new Error(token.error);
      const next = new Device(token.token, { logLevel: "error" });
      device.current = next;
      const currentDevice = () => isCurrent() && device.current === next;
      next.on("registered", () => {
        if (!currentDevice()) return;
        setReady(true);
        publish({
          ...(attempt.current && !attempt.current.ended ? {} : { phase: "idle" as const }),
          error: null,
        });
        refreshInputs();
      });
      next.on("unregistered", () => {
        if (currentDevice()) {
          setReady(false);
          publish({ error: "The phone disconnected. Reconnect before dialing." });
        }
      });
      next.on("error", () => {
        if (currentDevice()) {
          setReady(false);
          publish({
            error:
              "The phone connection failed. End any active call, then reconnect before dialing.",
          });
        }
      });
      next.on("tokenWillExpire", () => {
        void getVoiceToken({ data: { workspaceId } })
          .then((result) => {
            if (!currentDevice()) return;
            if (result.ok) next.updateToken(result.token);
            else publish({ error: result.error });
          })
          .catch(() => {
            if (currentDevice())
              publish({ error: "Phone authorization expired. Reconnect the phone." });
          });
      });
      next.on("incoming", (incoming) => incoming.reject());
      next.audio?.on("deviceChange", refreshInputs);
      await next.register();
      if (currentDevice()) refreshInputs();
    } catch (error) {
      if (isCurrent()) {
        device.current?.destroy();
        device.current = null;
        setReady(false);
        publish({
          phase: "offline",
          error: error instanceof Error ? error.message : "Could not connect the phone.",
        });
      }
      throw error;
    } finally {
      if (isCurrent()) connecting.current = false;
    }
  }, [workspaceId, ready, publish, refreshInputs]);
  async function start(id: string, phone: string, record: boolean) {
    if (!device.current || !ready) throw new Error("Connect the phone before dialing.");
    if (call.current || (attempt.current && !attempt.current.ended))
      throw new Error("End the current call first.");
    const current: Attempt = {
      id,
      phone,
      record,
      started: Date.now(),
      answered: null,
      heldMs: 0,
      heldSince: null,
      joined: false,
      ended: false,
      accepting: false,
      closing: false,
    };
    attempt.current = current;
    publish({
      phase: "connecting",
      phone,
      seconds: 0,
      talkSeconds: 0,
      heldSeconds: 0,
      muted: false,
      held: false,
      recording: false,
      legs: [],
      error: null,
    });
    try {
      const next = await device.current.connect({
        params: { WorkspaceId: workspaceId, AttemptId: id, Record: String(record) },
      });
      if (attempt.current !== current || current.ended || !alive.current) {
        next.disconnect();
        return;
      }
      call.current = next;
      const accepted = async () => {
        if (attempt.current !== current || current.ended || current.accepting) return;
        current.accepting = true;
        try {
          for (let retry = 0; retry < 6; retry++) {
            if (attempt.current !== current || current.ended) return;
            try {
              const result = await command({ operation: "add", phone, primary: true }, current);
              if (attempt.current !== current || current.ended) return;
              current.joined = true;
              update(result, current);
              return;
            } catch (error) {
              if (
                !(error instanceof Error) ||
                !error.message.includes("still joining") ||
                retry === 5
              )
                throw error;
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }
        } catch {
          await disconnected(
            current,
            "The call could not connect. Check the Call Board migration and existing TwiML voice URL, then try a new attempt.",
          );
        }
      };
      next.on("accept", () => void accepted());
      next.on("disconnect", () => void disconnected(current));
      next.on("cancel", () => void disconnected(current));
      next.on(
        "error",
        () =>
          void disconnected(
            current,
            "The calling provider ended this attempt. Check your account and connection before retrying.",
          ),
      );
      if (next.status() === "open") void accepted();
    } catch {
      finish(
        current,
        "The provider could not start the call. The attempted dial has been kept in Activity.",
      );
    }
  }
  function currentCall(): Attempt {
    const current = attempt.current;
    if (!current || current.ended || !call.current) throw new Error("There is no active call.");
    return current;
  }
  async function end() {
    const current = attempt.current;
    if (!current || current.ended) return;
    try {
      if (current.joined || current.accepting) await command({ operation: "end" }, current);
      finish(current);
    } catch (error) {
      if (attempt.current === current && !current.ended)
        publish({
          error:
            "The provider could not confirm the hangup. The call is still shown as active; try End call again.",
        });
      throw error;
    }
  }
  async function hold(held: boolean) {
    const current = currentCall();
    if (current.answered === null) throw new Error("Wait for the contact to answer.");
    update(await command({ operation: "hold", held }, current), current);
  }
  async function participant(phone: string, remove = false) {
    const current = currentCall();
    if (current.answered === null) throw new Error("Wait for the contact to answer.");
    update(await command({ operation: remove ? "remove" : "add", phone }, current), current);
  }
  async function microphone(id: string) {
    if (!device.current?.audio) throw new Error("Connect the phone before choosing a microphone.");
    await device.current.audio.setInputDevice(id);
    if (alive.current) setSelectedInput(id);
  }
  function mute(muted: boolean) {
    currentCall();
    call.current!.mute(muted);
    publish({ muted });
  }
  function digit(value: string) {
    currentCall();
    if (!/^[0-9*#]+$/.test(value)) throw new Error("Choose a keypad digit.");
    throw new Error(
      "Keypad tones to the prospect are unavailable in this conference connection. A provider-verified DTMF route is required.",
    );
  }
  return {
    snapshot,
    ready,
    inputs,
    selectedInput,
    connect,
    start,
    end,
    hold,
    participant,
    microphone,
    mute,
    digit,
  };
}
