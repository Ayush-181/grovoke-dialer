import { createFileRoute } from "@tanstack/react-router";

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function handle(request: Request) {
  // The redesigned phone uses the existing TwiML app, with a signed per-attempt route.
  // Requests from the original dialer retain their existing handling.
  if (request.method === "POST") {
    const form = new URLSearchParams(await request.clone().text());
    if (form.has("WorkspaceId") && form.has("AttemptId")) {
      const { callboardVoice } = await import("../../../../lib/callboard-handlers.server");
      return callboardVoice(request);
    }
  }
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("ws") ?? "";

  let params = new URLSearchParams(url.search);
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    const raw = await request.text();
    if (contentType.includes("application/json")) {
      const json = JSON.parse(raw || "{}") as Record<string, string>;
      params = new URLSearchParams(Object.entries(json));
    } else {
      params = new URLSearchParams(raw);
      for (const [k, v] of new URL(request.url).searchParams) params.set(k, v);
    }
  }

  const to = (params.get("To") ?? params.get("to") ?? "").trim();
  const mode = params.get("Mode") ?? "direct";
  const conferenceName = params.get("ConferenceName") ?? "";

  if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId)) {
    return xml("<Say>Workspace is not configured.</Say>");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("workspace_settings")
    .select("twilio_phone_number")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const callerId = settings?.twilio_phone_number ?? "";
  if (!callerId) return xml("<Say>No Twilio caller number is configured.</Say>");

  const recordingCallback = `${url.origin}/api/public/twiml/recording?ws=${encodeURIComponent(workspaceId)}`;

  if (mode === "conference" && conferenceName) {
    return xml(
      `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" record="record-from-start" recordingStatusCallback="${esc(recordingCallback)}">${esc(conferenceName)}</Conference></Dial>`,
    );
  }

  if (!to) return xml("<Say>No destination number was provided.</Say>");

  return xml(
    `<Dial callerId="${esc(callerId)}" answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="${esc(recordingCallback)}" recordingStatusCallbackEvent="completed" timeout="30"><Number>${esc(to)}</Number></Dial>`,
  );
}

export const Route = createFileRoute("/api/public/twiml/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
