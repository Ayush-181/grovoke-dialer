import { verifyCallboardWebhook, xmlEscape } from "./callboard-webhook.server";
export async function callboardVoice(request: Request) {
  const checked = await verifyCallboardWebhook(request);
  if (!checked) return new Response("Unauthorized", { status: 403 });
  const identity = `client:agent_${checked.log.user_id!.replaceAll("-", "").slice(0, 24)}`;
  if (checked.form.get("From") !== identity) return new Response("Forbidden", { status: 403 });
  const callSid = checked.form.get("CallSid");
  if (!callSid || !/^CA[a-f0-9]{32}$/i.test(callSid))
    return new Response("Invalid call", { status: 400 });
  const { data: existing, error: existingError } = await checked.supabaseAdmin
    .from("callboard_voice_attempts" as "leads")
    .select("*")
    .eq("id", checked.attemptId)
    .eq("workspace_id", checked.workspaceId)
    .maybeSingle();
  if (existingError) return new Response("Could not load call", { status: 503 });
  const prior = existing as unknown as { browser_call_sid: string; ended: boolean } | null;
  if (prior && (prior.browser_call_sid !== callSid || prior.ended))
    return new Response("Call already used", { status: 409 });
  if (!prior) {
    const saved = await checked.supabaseAdmin.from("callboard_voice_attempts" as "leads").insert({
      id: checked.attemptId,
      workspace_id: checked.workspaceId,
      user_id: checked.log.user_id,
      browser_call_sid: callSid,
    } as never);
    if (saved.error) return new Response("Could not save call", { status: 503 });
  }
  const record = checked.form.get("Record") === "true";
  const callback = `${checked.origin}/api/public/callboard/recording?ws=${encodeURIComponent(checked.workspaceId)}&attempt=${encodeURIComponent(checked.attemptId)}`;
  const body = `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false"${record ? ` record="record-from-start" recordingStatusCallback="${xmlEscape(callback)}" recordingStatusCallbackEvent="completed"` : ""}>${xmlEscape(checked.conference)}</Conference></Dial>`;
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function callboardRecording(request: Request) {
  const checked = await verifyCallboardWebhook(request);
  if (!checked) return new Response("Unauthorized", { status: 403 });
  if (checked.form.get("RecordingStatus") !== "completed") return new Response("", { status: 204 });
  const recordingUrl = recordingMediaUrl(
    checked.form.get("RecordingUrl") ?? "",
    checked.accountSid,
  );
  if (!recordingUrl) return new Response("Invalid recording", { status: 400 });
  const { error } = await checked.supabaseAdmin
    .from("dial_call_logs")
    .update({ recording_url: recordingUrl })
    .eq("workspace_id", checked.workspaceId)
    .eq("id", checked.attemptId);
  return new Response("", { status: error ? 500 : 204 });
}

/** Only store media owned by the account that signed this webhook. */
export function recordingMediaUrl(value: string, accountSid: string): string | null {
  try {
    const url = new URL(value);
    const match =
      /^\/2010-04-01\/Accounts\/(AC[a-f0-9]{32})\/Recordings\/(RE[a-f0-9]{32})(?:\.(?:mp3|wav))?$/i.exec(
        url.pathname,
      );
    if (
      url.protocol !== "https:" ||
      url.hostname !== "api.twilio.com" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !match ||
      match[1] !== accountSid
    )
      return null;
    return `https://api.twilio.com/2010-04-01/Accounts/${match[1]}/Recordings/${match[2]}.mp3`;
  } catch {
    return null;
  }
}
