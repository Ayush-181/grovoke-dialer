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
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("ws") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId)) return xml("<Hangup/>");

  let status = url.searchParams.get("DialCallStatus") ?? "";
  let callSid = url.searchParams.get("CallSid") ?? "";
  if (request.method === "POST") {
    const body = new URLSearchParams(await request.text());
    status = body.get("DialCallStatus") ?? status;
    callSid = body.get("CallSid") ?? callSid;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // A browser agent picked up — the accept handler owns the log row.
  if (status === "completed" || status === "answered") return xml("<Hangup/>");

  const { data: settings } = await supabaseAdmin
    .from("workspace_settings")
    .select("fallback_phone_number")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const fallback = settings?.fallback_phone_number?.trim();
  if (!fallback) {
    if (callSid) {
      await supabaseAdmin
        .from("dial_call_logs")
        .update({ outcome: "no_answer" })
        .eq("call_sid", callSid);
    }
    return xml("<Say>Sorry, nobody is available. Please try again later.</Say>");
  }

  const action = `${url.origin}/api/public/twiml/fallback-status?ws=${encodeURIComponent(workspaceId)}`;
  return xml(
    `<Dial timeout="30" action="${esc(action)}" method="POST"><Number>${esc(fallback)}</Number></Dial>`,
  );
}

export const Route = createFileRoute("/api/public/twiml/inbound-fallback")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
