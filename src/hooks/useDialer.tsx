import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getVoiceToken } from "@/lib/twilio.functions";
import { toE164 } from "@/lib/phone";

// Twilio Voice SDK is loaded as a plain <script> tag from public/vendor/twilio.min.js
// instead of bundled via npm import. This sidesteps a bundler-level incompatibility
// where the SDK's internal `import { EventEmitter } from 'events'` fails to resolve
// correctly in this project's production build (confirmed via two independent fix
// attempts at the module-resolution level, both producing the same
// "Class extends value undefined is not a constructor or null" crash). A plain
// script tag isn't processed by the bundler at all, so this class of issue can't
// occur — Twilio sets window.Twilio itself once the script loads.
declare global {
  interface Window {
    Twilio: any;
  }
}

let twilioScriptPromise: Promise<void> | null = null;
function loadTwilioScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Twilio?.Device) {
    return Promise.resolve();
  }
  if (twilioScriptPromise) return twilioScriptPromise;
  twilioScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/twilio.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      twilioScriptPromise = null;
      reject(new Error("Failed to load Twilio Voice SDK script"));
    };
    document.head.appendChild(script);
  });
  return twilioScriptPromise;
}

export type CallStatus = "offline" | "idle" | "incoming" | "connecting" | "live" | "conferencing";

export type IncomingCall = {
  from: string;
  businessName: string | null;
  ownerName: string | null;
  leadId: string | null;
};

export type DialTarget = {
  phone: string;
  leadId?: string | null;
  businessName?: string | null;
  ownerName?: string | null;
  sessionId?: string | null;
  state?: string | null;
  mode?: "direct" | "conference";
  conferenceName?: string;
};

export type LastCall = {
  logId: string | null;
  leadId: string | null;
  sessionId: string | null;
  phone: string;
  businessName: string | null;
  durationSeconds: number;
};

type DialerState = {
  status: CallStatus;
  ready: boolean;
  error: string | null;
  muted: boolean;
  durationSeconds: number;
  target: DialTarget | null;
  incoming: IncomingCall | null;
  lastCall: LastCall | null;
  inputDevices: { id: string; label: string }[];
  selectedInput: string | null;
  widgetOpen: boolean;
  setWidgetOpen: (open: boolean) => void;
  connect: () => Promise<void>;
  dial: (target: DialTarget) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  sendDigit: (digit: string) => void;
  setInputDevice: (deviceId: string) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => void;
  clearLastCall: () => void;
};

const Ctx = createContext<DialerState | null>(null);

/* ---------- 440 + 480 Hz ringback ---------- */
class Ringback {
  private ctx: AudioContext | null = null;
  private nodes: OscillatorNode[] = [];
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);
    for (const freq of [440, 480]) {
      const osc = this.ctx.createOscillator();
      osc.frequency.value = freq;
      osc.type = "sine";
      osc.connect(this.gain);
      osc.start();
      this.nodes.push(osc);
    }
    const cycle = () => {
      if (!this.ctx || !this.gain) return;
      const now = this.ctx.currentTime;
      this.gain.gain.setValueAtTime(0.08, now);
      this.gain.gain.setValueAtTime(0, now + 2);
    };
    cycle();
    this.timer = setInterval(cycle, 6000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
    this.gain = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

export function DialerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const deviceRef = useRef<any | null>(null);
  const callRef = useRef<any | null>(null);
  const ringbackRef = useRef<Ringback>(new Ringback());
  const startedAtRef = useRef<number | null>(null);
  const logIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<CallStatus>("offline");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [durationSeconds, setDuration] = useState(0);
  const [target, setTarget] = useState<DialTarget | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [lastCall, setLastCall] = useState<LastCall | null>(null);
  const [inputDevices, setInputDevices] = useState<{ id: string; label: string }[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);

  const refreshInputs = useCallback(() => {
    const device = deviceRef.current;
    if (!device) return;
    const list: { id: string; label: string }[] = [];
    device.audio?.availableInputDevices?.forEach((info: any, id: string) => {
      list.push({ id, label: info.label || `Microphone ${list.length + 1}` });
    });
    setInputDevices(list);
  }, []);

  const connect = useCallback(async () => {
    if (!workspace) return;
    if (deviceRef.current) return;
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      const result = await getVoiceToken({ data: { workspaceId: workspace.id } });
      if (!result.ok) {
        setError(result.error);
        setStatus("offline");
        return;
      }
      await loadTwilioScript();
      const TwilioDevice = window.Twilio.Device;
      const device = new TwilioDevice(result.token, {
        logLevel: "error",
        codecPreferences: ["opus", "pcmu"] as never,
      });
      device.on("registered", () => {
        setReady(true);
        setStatus("idle");
        refreshInputs();
      });
      device.on("error", (e: { message?: string }) => {
        setError(e?.message ?? "Twilio device error");
      });
      device.on("incoming", (call: any) => {
        if (callRef.current) {
          call.reject();
          return;
        }
        const from = (call.parameters as Record<string, string>)?.["From"] ?? "";
        callRef.current = call;
        setIncoming({ from, businessName: null, ownerName: null, leadId: null });
        setStatus("incoming");
        setWidgetOpen(true);
        const normalized = from.replace(/\D/g, "").slice(-10);
        if (normalized) {
          void supabase
            .from("leads")
            .select("id, business_name, owner_name")
            .eq("workspace_id", workspace.id)
            .like("phone_normalized", `%${normalized}`)
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
              if (!data) return;
              setIncoming((prev) =>
                prev
                  ? {
                      ...prev,
                      leadId: data.id,
                      businessName: data.business_name,
                      ownerName: data.owner_name,
                    }
                  : prev,
              );
            });
        }
        call.on("cancel", () => {
          setIncoming(null);
          callRef.current = null;
          setStatus(deviceRef.current ? "idle" : "offline");
        });
        call.on("disconnect", () => void finalizeRef.current?.());
        call.on("reject", () => {
          setIncoming(null);
          callRef.current = null;
          setStatus(deviceRef.current ? "idle" : "offline");
        });
      });
      device.on("tokenWillExpire", async () => {
        const next = await getVoiceToken({ data: { workspaceId: workspace.id } });
        if (next.ok) device.updateToken(next.token);
      });
      device.audio?.on("deviceChange", refreshInputs);
      await device.register();
      deviceRef.current = device;
      refreshInputs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the phone");
    }
  }, [workspace, refreshInputs]);

  useEffect(() => {
    return () => {
      ringbackRef.current.stop();
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, []);

  // Call timer
  useEffect(() => {
    if (status !== "live" && status !== "conferencing") return;
    const t = setInterval(() => {
      if (startedAtRef.current) {
        setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  const finalizeRef = useRef<(() => Promise<void>) | null>(null);

  const finalize = useCallback(async () => {
    ringbackRef.current.stop();
    const seconds = startedAtRef.current
      ? Math.floor((Date.now() - startedAtRef.current) / 1000)
      : 0;
    const t = target;
    if (logIdRef.current) {
      await supabase
        .from("dial_call_logs")
        .update({ duration_seconds: seconds })
        .eq("id", logIdRef.current);
    }
    if (t) {
      setLastCall({
        logId: logIdRef.current,
        leadId: t.leadId ?? null,
        sessionId: t.sessionId ?? null,
        phone: t.phone,
        businessName: t.businessName ?? null,
        durationSeconds: seconds,
      });
    }
    callRef.current = null;
    logIdRef.current = null;
    startedAtRef.current = null;
    setDuration(0);
    setMuted(false);
    setTarget(null);
    setIncoming(null);
    setStatus(deviceRef.current ? "idle" : "offline");
  }, [target]);

  useEffect(() => {
    finalizeRef.current = finalize;
  }, [finalize]);

  const acceptIncoming = useCallback(async () => {
    const call = callRef.current;
    if (!call || !incoming || !workspace || !user) return;
    call.accept();
    startedAtRef.current = Date.now();
    setStatus("live");
    setTarget({
      phone: incoming.from,
      leadId: incoming.leadId,
      businessName: incoming.businessName,
      ownerName: incoming.ownerName,
    });
    const parentSid =
      (call.customParameters as Map<string, string> | undefined)?.get("parentCallSid") ?? null;
    const childSid = (call.parameters as Record<string, string>)?.["CallSid"] ?? null;

    // The webhook already logged this call when it started ringing — update
    // that row instead of creating a duplicate.
    if (parentSid) {
      const { data: existing } = await supabase
        .from("dial_call_logs")
        .update({
          user_id: user.id,
          outcome: "connected_dm",
          missed_call_acknowledged: true,
          business_name: incoming.businessName,
          lead_id: incoming.leadId,
        })
        .eq("call_sid", parentSid)
        .select("id")
        .maybeSingle();
      if (existing?.id) {
        logIdRef.current = existing.id;
        setIncoming(null);
        return;
      }
    }

    const { data } = await supabase
      .from("dial_call_logs")
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        lead_id: incoming.leadId,
        call_sid: parentSid ?? childSid,
        phone: incoming.from,
        business_name: incoming.businessName,
        direction: "inbound",
        outcome: "connected_dm",
        missed_call_acknowledged: true,
        called_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    logIdRef.current = data?.id ?? null;
    setIncoming(null);

  }, [incoming, workspace, user]);

  const rejectIncoming = useCallback(() => {
    callRef.current?.reject();
    callRef.current = null;
    setIncoming(null);
    setStatus(deviceRef.current ? "idle" : "offline");
  }, []);

  const dial = useCallback(
    async (next: DialTarget) => {
      if (!workspace || !user) return;
      if (!deviceRef.current) await connect();
      const device = deviceRef.current;
      if (!device) {
        toast.error(error ?? "Phone is not connected");
        return;
      }
      if (callRef.current) {
        toast.error("A call is already in progress");
        return;
      }

      const to = toE164(next.phone);
      if (!to) {
        toast.error("Invalid phone number");
        return;
      }

      setTarget(next);
      setStatus("connecting");
      setLastCall(null);
      ringbackRef.current.start();

      try {
        const call = await device.connect({
          params: {
            To: to,
            Mode: next.mode ?? "direct",
            ConferenceName: next.conferenceName ?? "",
          },
        });
        callRef.current = call;

        call.on("accept", async () => {
          ringbackRef.current.stop();
          startedAtRef.current = Date.now();
          setStatus(next.mode === "conference" ? "conferencing" : "live");
          const callSid = (call.parameters as Record<string, string>)?.["CallSid"] ?? null;
          const { data } = await supabase
            .from("dial_call_logs")
            .insert({
              workspace_id: workspace.id,
              user_id: user.id,
              lead_id: next.leadId ?? null,
              session_id: next.sessionId ?? null,
              call_sid: callSid,
              phone: to,
              business_name: next.businessName ?? null,
              outcome: "dialed",
              called_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          logIdRef.current = data?.id ?? null;
          if (next.leadId) {
            await supabase
              .from("leads")
              .update({ last_called_at: new Date().toISOString(), status: "in_progress" })
              .eq("id", next.leadId);
          }
        });
        call.on("disconnect", () => void finalize());
        call.on("cancel", () => void finalize());
        call.on("reject", () => void finalize());
        call.on("error", (e: { message?: string }) => {
          toast.error(e?.message ?? "Call failed");
          void finalize();
        });
      } catch (e) {
        ringbackRef.current.stop();
        setStatus("idle");
        setTarget(null);
        toast.error(e instanceof Error ? e.message : "Could not place the call");
      }
    },
    [workspace, user, connect, error, finalize],
  );

  const hangup = useCallback(() => {
    if (callRef.current) callRef.current.disconnect();
    else void finalize();
  }, [finalize]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !call.isMuted();
    call.mute(next);
    setMuted(next);
  }, []);

  const sendDigit = useCallback((digit: string) => {
    callRef.current?.sendDigits(digit);
  }, []);

  const setInputDevice = useCallback(async (deviceId: string) => {
    const device = deviceRef.current;
    if (!device?.audio) return;
    await device.audio.setInputDevice(deviceId);
    setSelectedInput(deviceId);
  }, []);

  const value = useMemo<DialerState>(
    () => ({
      status,
      ready,
      error,
      muted,
      durationSeconds,
      target,
      incoming,
      lastCall,
      inputDevices,
      selectedInput,
      widgetOpen,
      setWidgetOpen,
      connect,
      dial,
      hangup,
      toggleMute,
      sendDigit,
      setInputDevice,
      acceptIncoming,
      rejectIncoming,
      clearLastCall: () => setLastCall(null),
    }),
    [
      status,
      ready,
      error,
      muted,
      durationSeconds,
      target,
      incoming,
      lastCall,
      inputDevices,
      selectedInput,
      widgetOpen,
      connect,
      dial,
      hangup,
      toggleMute,
      sendDigit,
      setInputDevice,
      acceptIncoming,
      rejectIncoming,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDialer(): DialerState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDialer must be used inside DialerProvider");
  return ctx;
}
