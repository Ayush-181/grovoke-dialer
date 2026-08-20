import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signTwilioAccessToken } from "./twilio-token.server";

export type VoiceTokenResult =
  | { ok: true; token: string; identity: string; callerId: string | null }
  | { ok: false; error: string };

export const getVoiceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }): Promise<VoiceTokenResult> => {
    const { supabase, userId } = context;
    const { data: settings, error } = await supabase
      .from("workspace_settings")
      .select(
        "twilio_account_sid, twilio_api_key_sid, twilio_api_key_secret, twilio_twiml_app_sid, twilio_phone_number",
      )
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (
      !settings?.twilio_account_sid ||
      !settings.twilio_api_key_sid ||
      !settings.twilio_api_key_secret ||
      !settings.twilio_twiml_app_sid
    ) {
      return {
        ok: false,
        error:
          "Twilio is not configured. Add Account SID, API Key SID/Secret and TwiML App SID in Settings.",
      };
    }

    const identity = `agent_${userId.replace(/-/g, "").slice(0, 24)}`;
    const token = await signTwilioAccessToken({
      accountSid: settings.twilio_account_sid,
      apiKeySid: settings.twilio_api_key_sid,
      apiKeySecret: settings.twilio_api_key_secret,
      twimlAppSid: settings.twilio_twiml_app_sid,
      identity,
      ttlSeconds: 3600,
    });

    return { ok: true, token, identity, callerId: settings.twilio_phone_number ?? null };
  });
