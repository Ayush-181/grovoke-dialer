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

/** Must match the identity scheme used when minting voice tokens. */
function identityFor(userId: string) {
  return `agent_${userId.replace(/-/g, "").slice(0, 24)}`;
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("ws") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId)) {
    return xml("<Say>Workspace is not configured.</Say>");
  }

  let from = url.searchParams.get("From") ?? "";
  let callSid = url.searchParams.get("CallSid") ?? "";
  if (request.method === "POST") {
    const body = new URLSearchParams(await request.text());
    from = body.get("From") ?? from;
    callSid = body.get("CallSid") ?? callSid;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Log the inbound call the moment it rings, so it is captured even when
  // nobody is online. Later legs update this same row by call_sid.
  if (callSid) {
    const normalized = from.replace(/\D/g, "").slice(-10);
    let leadId: string | null = null;
    let businessName: string | null = null;
    if (normalized) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, business_name")
        .eq("workspace_id", workspaceId)
        .like("phone_normalized", `%${normalized}`)
        .limit(1)
        .maybeSingle();
      leadId = lead?.id ?? null;
      businessName = lead?.business_name ?? null;
    }
    const { data: existing } = await supabaseAdmin
      .from("dial_call_logs")
      .select("id")
      .eq("call_sid", callSid)
      .maybeSingle();
    if (!existing) {
      await supabaseAdmin.from("dial_call_logs").insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        call_sid: callSid,
        phone: from || "unknown",
        business_name: businessName,
        direction: "inbound",
        outcome: "dialed",
        called_at: new Date().toISOString(),
      });
    }
  }

  const { data: members } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  const clients = (members ?? [])
    .map(
      (m) =>
        `<Client><Identity>${esc(identityFor(m.user_id))}</Identity>` +
        `<Parameter name="parentCallSid" value="${esc(callSid)}"/></Client>`,
    )
    .join("");

  const action = `${url.origin}/api/public/twiml/inbound-fallback?ws=${encodeURIComponent(workspaceId)}`;

  if (!clients) {
    // Nobody to ring in the browser — go straight to the fallback leg.
    const { data: settings } = await supabaseAdmin
      .from("workspace_settings")
      .select("fallback_phone_number")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const fallback = settings?.fallback_phone_number?.trim() ?? "";
    if (!fallback) {
      if (callSid) {
        await supabaseAdmin
          .from("dial_call_logs")
          .update({ outcome: "no_answer" })
          .eq("call_sid", callSid);
      }
      return xml("<Say>No agents are available right now. Goodbye.</Say>");
    }
    const fbAction = `${url.origin}/api/public/twiml/fallback-status?ws=${encodeURIComponent(workspaceId)}`;
    return xml(
      `<Dial timeout="30" action="${esc(fbAction)}" method="POST"><Number>${esc(fallback)}</Number></Dial>`,
    );
  }

  return xml(`<Dial timeout="20" answerOnBridge="true" action="${esc(action)}" method="POST">${clients}</Dial>`);
}

export const Route = createFileRoute("/api/public/twiml/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
