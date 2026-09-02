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

export type UsageCategory = { category: string; description: string; count: number; usage: string; usageUnit: string; price: number };

export type TwilioUsageResult =
  | {
      ok: true;
      currency: string;
      balance: number | null;
      monthSpend: number;
      calls: number;
      callMinutes: number;
      daysLeft: number | null;
      categories: UsageCategory[];
    }
  | { ok: false; error: string };

export const getTwilioUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }): Promise<TwilioUsageResult> => {
    const { supabase } = context;
    const { data: settings, error } = await supabase
      .from("workspace_settings")
      .select("twilio_account_sid, twilio_auth_token")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    const sid = settings?.twilio_account_sid;
    const token = settings?.twilio_auth_token;
    if (!sid || !token) {
      return { ok: false, error: "Add your Twilio Account SID and Auth Token in Settings to see usage." };
    }

    const auth = `Basic ${btoa(`${sid}:${token}`)}`;
    const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
    const get = async (path: string) => {
      const res = await fetch(`${base}${path}`, { headers: { Authorization: auth } });
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
      return res.json() as Promise<any>;
    };

    try {
      const [balance, usage] = await Promise.all([
        get(`/Balance.json`).catch(() => null),
        get(`/Usage/Records/ThisMonth.json?PageSize=200`),
      ]);

      const records: any[] = usage?.usage_records ?? [];
      const categories: UsageCategory[] = records
        .map((r) => ({
          category: String(r.category ?? ""),
          description: String(r.description ?? r.category ?? ""),
          count: Number(r.count ?? 0),
          usage: String(r.usage ?? "0"),
          usageUnit: String(r.usage_unit ?? ""),
          price: Number(r.price ?? 0),
        }))
        .filter((c) => c.price > 0 || c.count > 0)
        .sort((a, b) => b.price - a.price);

      const total = records.find((r) => r.category === "totalprice");
      const monthSpend = total ? Number(total.price ?? 0) : categories.reduce((s, c) => s + c.price, 0);

      const callRecords = records.filter((r) => String(r.category) === "calls");
      const calls = callRecords.reduce((s, r) => s + Number(r.count ?? 0), 0);
      const callMinutes = callRecords.reduce((s, r) => s + Number(r.usage ?? 0), 0);

      const now = new Date();
      const dayOfMonth = now.getUTCDate();
      const burnPerDay = monthSpend / Math.max(1, dayOfMonth);
      const bal = balance ? Number(balance.balance ?? 0) : null;
      const daysLeft = bal !== null && burnPerDay > 0 ? Math.floor(bal / burnPerDay) : null;

      return {
        ok: true,
        currency: String(balance?.currency ?? usage?.usage_records?.[0]?.price_unit ?? "USD").toUpperCase(),
        balance: bal,
        monthSpend,
        calls,
        callMinutes,
        daysLeft,
        categories,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Twilio request failed" };
    }
  });
