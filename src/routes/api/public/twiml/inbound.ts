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

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: members } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  const clients = (members ?? [])
    .map((m) => `<Client>${esc(identityFor(m.user_id))}</Client>`)
    .join("");

  const action = `${url.origin}/api/public/twiml/inbound-fallback?ws=${encodeURIComponent(workspaceId)}`;

  if (!clients) {
    // Nobody to ring in the browser — go straight to the fallback leg.
    const { data: settings } = await supabaseAdmin
      .from("workspace_settings")
      .select("fallback_phone_number")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const fallback = settings?.fallback_phone_number ?? "";
    if (!fallback) return xml("<Say>No agents are available right now. Goodbye.</Say>");
    return xml(`<Dial><Number>${esc(fallback)}</Number></Dial>`);
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
