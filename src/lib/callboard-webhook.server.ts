import { conferenceName } from "./callboard-voice.shared";

type Settings = { twilio_auth_token: string | null; twilio_account_sid: string | null };
export async function validTwilioSignature(
  url: string,
  form: URLSearchParams,
  signature: string,
  token: string,
): Promise<boolean> {
  let message = url;
  for (const key of [...new Set(form.keys())].sort())
    for (const value of [...new Set(form.getAll(key))].sort()) message += key + value;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const expected = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message)),
      ),
    ),
  );
  if (signature.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < signature.length; i++)
    difference |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
export async function verifyCallboardWebhook(request: Request) {
  if (
    request.method !== "POST" ||
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("application/x-www-form-urlencoded")
  )
    return null;
  if (Number(request.headers.get("content-length") ?? 0) > 64 * 1024) return null;
  const url = new URL(request.url);
  const body = await request.text();
  if (body.length > 64 * 1024) return null;
  const form = new URLSearchParams(body);
  const workspaceId = form.get("WorkspaceId") ?? url.searchParams.get("ws") ?? "";
  const attemptId = form.get("AttemptId") ?? url.searchParams.get("attempt") ?? "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(workspaceId) || !uuid.test(attemptId)) return null;
  const { supabaseAdmin } = await import("../integrations/supabase/client.server");
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("workspace_settings")
    .select("twilio_auth_token,twilio_account_sid")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const config = settings as Settings | null;
  if (
    settingsError ||
    !config?.twilio_auth_token ||
    !config.twilio_account_sid ||
    form.get("AccountSid") !== config.twilio_account_sid
  )
    return null;
  if (
    !(await validTwilioSignature(
      request.url,
      form,
      request.headers.get("X-Twilio-Signature") ?? "",
      config.twilio_auth_token,
    ))
  )
    return null;
  const { data: log, error: logError } = await supabaseAdmin
    .from("dial_call_logs")
    .select("id,user_id,phone")
    .eq("workspace_id", workspaceId)
    .eq("id", attemptId)
    .maybeSingle();
  if (logError || !log?.user_id) return null;
  return {
    form,
    workspaceId,
    attemptId,
    log,
    supabaseAdmin,
    accountSid: config.twilio_account_sid,
    conference: conferenceName(workspaceId, attemptId),
    origin: url.origin,
  };
}
export function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
