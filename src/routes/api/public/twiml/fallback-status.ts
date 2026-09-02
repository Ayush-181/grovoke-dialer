import { createFileRoute } from "@tanstack/react-router";

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

/**
 * Action callback for the cell-phone fallback <Dial>. Decides the final
 * outcome of an inbound call that the browser agents did not answer.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("ws") ?? "";

  let status = url.searchParams.get("DialCallStatus") ?? "";
  let callSid = url.searchParams.get("CallSid") ?? "";
  let duration = url.searchParams.get("DialCallDuration") ?? "";
  if (request.method === "POST") {
    const body = new URLSearchParams(await request.text());
    status = body.get("DialCallStatus") ?? status;
    callSid = body.get("CallSid") ?? callSid;
    duration = body.get("DialCallDuration") ?? duration;
  }

  if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId) || !callSid) return xml("<Hangup/>");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const answered = status === "completed" || status === "answered";

  await supabaseAdmin
    .from("dial_call_logs")
    .update(
      answered
        ? {
            outcome: "connected_other",
            notes: "Answered on fallback phone",
            duration_seconds: Number(duration) || 0,
          }
        : { outcome: "no_answer" },
    )
    .eq("call_sid", callSid);

  return xml("<Hangup/>");
}

export const Route = createFileRoute("/api/public/twiml/fallback-status")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
