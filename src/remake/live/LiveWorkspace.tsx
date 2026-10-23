import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "../../hooks/useAuth";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useGoogleCalendar } from "../../hooks/useGoogleCalendar";
import { supabase } from "../../integrations/supabase/client";
import { calendarBusy, sendCalendarInvite } from "../../lib/google-calendar";
import { App } from "../App";
import type { Action, Booking, State } from "../model";
import type { RuntimeServices } from "../runtime";
import type { CallboardClient } from "./database";
import { loadWorkspace, persistTransition } from "./repository";
import { stateFromWorkspace } from "./mapping";
import { useCallboardVoice } from "./useVoice";
import remakeCss from "../remake.css?url";

const client = supabase as unknown as CallboardClient;
export function LiveWorkspace() {
  const { initialized, user, signOut } = useAuth();
  const { workspace, loading } = useWorkspace();
  const navigate = useNavigate();
  useEffect(() => {
    const previousTheme = document.documentElement.dataset["theme"],
      previousScheme = document.documentElement.style.colorScheme;
    return () => {
      if (previousTheme === undefined) delete document.documentElement.dataset["theme"];
      else document.documentElement.dataset["theme"] = previousTheme;
      document.documentElement.style.colorScheme = previousScheme;
    };
  }, []);
  useEffect(() => {
    if (initialized && !user) void navigate({ to: "/auth" });
  }, [initialized, user, navigate]);
  if (!initialized || loading || !user)
    return (
      <div className="p-8" role="status">
        Loading your workspace…
      </div>
    );
  if (!workspace)
    return (
      <div className="p-8" role="alert">
        No authorized workspace is available. <a href="/dashboard">Return to the original app</a>
      </div>
    );
  return (
    <ConnectedWorkspace
      key={`${user.id}:${workspace.id}`}
      workspace={workspace}
      identity={{
        userId: user.id,
        name: String(user.user_metadata?.["display_name"] ?? user.email?.split("@")[0] ?? "Ash"),
        email: user.email ?? "",
      }}
      signOut={signOut}
    />
  );
}
function ConnectedWorkspace({
  workspace,
  identity,
  signOut,
}: {
  workspace: { id: string; name: string };
  identity: { name: string; email: string; userId: string };
  signOut: () => Promise<void>;
}) {
  const [seed, setSeed] = useState<State | null>(null),
    [error, setError] = useState("");
  const [availableRecordings, setAvailableRecordings] = useState<string[]>([]);
  const revision = useRef(0),
    generation = useRef(0);
  const google = useGoogleCalendar();
  const voice = useCallboardVoice(workspace.id);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const rows = await loadWorkspace(client, workspace.id);
      if (request !== generation.current) return;
      revision.current = rows.document?.revision ?? 0;
      setAvailableRecordings(
        rows.logs.filter((log) => Boolean(log.recording_url)).map((log) => log.id),
      );
      setSeed(
        stateFromWorkspace(rows, {
          userId: identity.userId,
          name: identity.name,
          email: identity.email,
          workspaceName: workspace.name,
        }),
      );
      setError("");
    } catch (problem) {
      if (request === generation.current)
        setError(problem instanceof Error ? problem.message : "The workspace could not load.");
      throw problem;
    }
  }, [workspace.id, workspace.name, identity.name, identity.email, identity.userId]);
  useEffect(() => {
    void refresh().catch(() => {});
    const requestGeneration = generation.current;
    return () => {
      generation.current = requestGeneration + 1;
    };
  }, [refresh]);
  const execute = useCallback(
    async (action: Action, before: State, after: State) => {
      const phone = voiceRef.current;
      if (action.type === "restoreData")
        throw new Error(
          "Restore backups in the offline copy first. Live replacement is disabled to protect existing records.",
        );
      if (action.type === "digit") {
        throw new Error("In-call keypad tones are unavailable with this conference connection.");
      }
      if (action.type === "mute") {
        phone.mute(!!after.call?.muted);
        return;
      }
      if (action.type === "hold") {
        await phone.hold(!!after.call?.held);
        return;
      }
      if (action.type === "participant") {
        await phone.participant(action.phone, !!action.remove);
        return;
      }
      if (
        action.type === "preferences" &&
        action.patch.microphone &&
        action.patch.microphone !== before.preferences.microphone
      )
        await phone.microphone(action.patch.microphone);
      if (action.type === "dial" || action.type === "manualDial") {
        if (!phone.ready) throw new Error("Connect the phone before dialing.");
        await phone.microphone(before.preferences.microphone);
      }
      if (action.type === "end") await phone.end();
      revision.current = await persistTransition(
        client,
        workspace.id,
        revision.current,
        action,
        before,
        after,
      );
      if ((action.type === "dial" || action.type === "manualDial") && after.call) {
        // Persist the attempted dial before invoking the provider. A failed dial is still an attempt.
        await phone.start(after.call.id, after.call.phone, after.recordingEnabled);
      }
    },
    [workspace.id],
  );
  const {
    configured: googleConfigured,
    ready: googleReady,
    email: googleEmail,
    connecting: googleConnecting,
    error: googleError,
    connect: googleConnect,
    getToken: googleGetToken,
  } = google;
  const calendar = useMemo<NonNullable<RuntimeServices["calendar"]>>(
    () => ({
      configured: googleConfigured,
      ready: googleReady,
      connected: !!googleEmail,
      connecting: googleConnecting,
      email: googleEmail,
      error: googleError,
      connect: () => {
        if (!googleConfigured)
          throw new Error("Configure VITE_GOOGLE_CALENDAR_CLIENT_ID in the frontend build first.");
        if (!googleReady) throw new Error("Google is still loading. Try again in a moment.");
        googleConnect();
      },
      getBusy: (start, end) => calendarBusy(googleGetToken(), start, end),
      createBooking: async (booking: Booking) => {
        const token = googleGetToken();
        if (!googleEmail) throw new Error("Connect Google Calendar before booking.");
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("Sign in again before booking.");
        const event = await sendCalendarInvite(token, {
          id: booking.id,
          title: booking.title,
          starts_at: booking.at,
          ends_at: new Date(Date.parse(booking.at) + booking.duration * 60000).toISOString(),
          lead_timezone: booking.zone,
          attendees: booking.guests.split(/[;,\s]+/).filter(Boolean),
          notes: booking.notes,
          location: booking.location ?? "",
          add_meet: booking.meet,
          google_event_id: booking.id.replaceAll("-", ""),
        });
        const saved = await supabase.from("bookings").upsert(
          {
            id: booking.id,
            workspace_id: workspace.id,
            created_by: auth.user.id,
            lead_id: booking.leadId || null,
            title: booking.title,
            starts_at: booking.at,
            ends_at: new Date(Date.parse(booking.at) + booking.duration * 60000).toISOString(),
            lead_timezone: booking.zone,
            attendees: booking.guests.split(/[;,\s]+/).filter(Boolean),
            notes: booking.notes,
            location: booking.location ?? "",
            add_meet: booking.meet,
            google_account_email: googleEmail,
            invite_from: googleEmail,
            delivery_method: "google_calendar",
            google_event_id: event.id,
            status: "synced",
            google_event_url: event.htmlLink ?? null,
            meet_url: event.hangoutLink ?? null,
          },
          { onConflict: "id" },
        );
        if (saved.error)
          throw new Error(
            "Google Calendar created the invitation, but the booking record could not be saved. Retry with this same form; a second invitation will not be sent.",
          );
        return {
          ...booking,
          ...(event.htmlLink ? { googleEventUrl: event.htmlLink } : {}),
          ...(event.hangoutLink ? { meetUrl: event.hangoutLink } : {}),
        };
      },
    }),
    [
      googleConfigured,
      googleReady,
      googleEmail,
      googleConnecting,
      googleError,
      googleConnect,
      googleGetToken,
      workspace.id,
    ],
  );
  const runtime: RuntimeServices = {
    mode: "live",
    label: workspace.name,
    capabilities: {
      voice: true,
      dtmf: false,
      hold: true,
      conference: true,
      recording: true,
      calendar: googleConfigured,
    },
    voice: {
      ready: voice.ready,
      status: voice.snapshot.phase,
      snapshot: voice.snapshot,
      inputDevices: voice.inputs,
      selectedInput: voice.selectedInput,
      error: voice.snapshot.error ?? null,
      connect: voice.connect,
    },
    calendar,
    recordings: {
      availableIds: availableRecordings,
      load: async (id) => {
        if (!availableRecordings.includes(id)) throw new Error("This recording is not available.");
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error("Sign in again to load recordings.");
        const response = await fetch(`/api/recordings/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error("The recording could not be loaded.");
        return response.blob();
      },
    },
    execute,
    refresh,
    signOut,
  };
  if (!seed)
    return (
      <div className="p-8" role={error ? "alert" : "status"}>
        {error || "Loading leads, call history and configuration…"}
        {error && (
          <p>
            <button onClick={() => void refresh().catch(() => {})}>Retry</button> ·{" "}
            <a href="/dashboard">Original app</a>
          </p>
        )}
      </div>
    );
  return (
    <>
      <link rel="stylesheet" href={remakeCss} />
      <App initialState={seed} runtime={runtime} />
    </>
  );
}
