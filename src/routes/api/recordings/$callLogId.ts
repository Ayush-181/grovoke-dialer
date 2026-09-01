import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Streams a Twilio call recording back to the browser.
 *
 * Twilio's raw recording URLs require HTTP Basic auth (Account SID + Auth Token),
 * which an <audio> tag cannot supply. The browser fetches this route with the
 * user's Supabase bearer token; we resolve the recording through RLS (so the
 * caller must be a member of the owning workspace) and proxy the audio.
 */
async function handle(request: Request, callLogId: string): Promise<Response> {
  if (!/^[0-9a-fA-F-]{36}$/.test(callLogId)) {
    return new Response("bad id", { status: 400 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token.split(".").length !== 3) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return new Response("Server not configured", { status: 500 });

  const supabase = createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: claims } = await supabase.auth.getClaims(token);
  if (!claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

  const { data: log, error } = await supabase
    .from("dial_call_logs")
    .select("recording_url, workspace_id")
    .eq("id", callLogId)
    .maybeSingle();
  if (error) return new Response(error.message, { status: 403 });
  if (!log?.recording_url) return new Response("No recording", { status: 404 });

  const { data: settings } = await supabase
    .from("workspace_settings")
    .select("twilio_account_sid, twilio_auth_token")
    .eq("workspace_id", log.workspace_id)
    .maybeSingle();

  const headers: Record<string, string> = {};
  if (settings?.twilio_account_sid && settings.twilio_auth_token) {
    headers["Authorization"] =
      "Basic " + btoa(`${settings.twilio_account_sid}:${settings.twilio_auth_token}`);
  }
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const upstream = await fetch(log.recording_url, { headers });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Twilio returned ${upstream.status}`, { status: 502 });
  }

  const out = new Headers();
  out.set("content-type", upstream.headers.get("content-type") ?? "audio/mpeg");
  const len = upstream.headers.get("content-length");
  if (len) out.set("content-length", len);
  const cr = upstream.headers.get("content-range");
  if (cr) out.set("content-range", cr);
  out.set("accept-ranges", "bytes");
  out.set("cache-control", "private, max-age=300");

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/api/recordings/$callLogId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params.callLogId),
    },
  },
});
