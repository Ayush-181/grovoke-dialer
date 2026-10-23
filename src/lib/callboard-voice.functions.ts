import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "../integrations/supabase/auth-middleware";
import { dialNumber } from "../remake/numbers";
import {
  conferenceName,
  controlConference,
  type StoredVoiceLeg,
  type VoiceResult,
} from "./callboard-voice.shared";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/types";
export type { VoiceLeg, VoiceResult } from "./callboard-voice.shared";

type VoiceDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      callboard_voice_attempts: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          browser_call_sid: string;
          legs: Json;
          ended: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          user_id: string;
          browser_call_sid: string;
          legs?: Json;
          ended?: boolean;
          created_at?: string;
        };
        Update: { legs?: Json; ended?: boolean };
        Relationships: [];
      };
    };
  };
};

export const voiceCommandSchema = z
  .object({
    workspaceId: z.string().uuid(),
    attemptId: z.string().uuid(),
    operation: z.enum(["add", "state", "hold", "remove", "end"]),
    phone: z.string().optional(),
    held: z.boolean().optional(),
    primary: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.operation === "add" || value.operation === "remove") && !value.phone)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a destination number.",
        path: ["phone"],
      });
    if (value.operation === "hold" && typeof value.held !== "boolean")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose whether to hold or resume.",
        path: ["held"],
      });
    if (value.primary !== undefined && value.operation !== "add")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only adding a contact accepts a primary destination.",
        path: ["primary"],
      });
  });
export type VoiceCommand = z.infer<typeof voiceCommandSchema>;
export const callboardVoiceCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: VoiceCommand) => voiceCommandSchema.parse(value))
  .handler(async ({ data, context }): Promise<VoiceResult> => {
    const { supabase, userId } = context;
    const { data: member, error: memberError } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberError || !member) throw new Error("Workspace access denied.");
    const { data: log, error: logError } = await supabase
      .from("dial_call_logs")
      .select("id,user_id,phone")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.attemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (logError || !log) throw new Error("Save this call attempt before connecting the phone.");
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    const registry = () =>
      (supabaseAdmin as unknown as SupabaseClient<VoiceDatabase>).from("callboard_voice_attempts");
    const { data: attempt, error: attemptError } = await registry()
      .select("*")
      .eq("id", data.attemptId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (attemptError) throw new Error("Install the Call Board voice migration before calling.");
    const record = attempt as unknown as {
      user_id: string;
      ended: boolean;
      legs: StoredVoiceLeg[];
    } | null;
    if (!record || record.user_id !== userId)
      throw new Error("The browser has not joined this call. Reconnect the phone and try again.");
    if (record.ended) return { legs: [], ended: true };
    const legs = record.legs ?? [];
    const phone = data.phone ? dialNumber(data.phone) : null;
    if (data.phone && !phone) throw new Error("Enter a valid destination number.");
    if (data.operation === "add") {
      if (!phone || (data.primary && dialNumber(log.phone) !== phone))
        throw new Error("Invalid call destination.");
      const { data: state, error: stateError } = await supabaseAdmin
        .from("callboard_workspace_state" as "leads")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
      if (stateError)
        throw new Error("Do-not-call protection could not be checked. No call was started.");
      const doc = (state as unknown as { data?: { suppressedNumbers?: string[] } } | null)?.data;
      if (doc?.suppressedNumbers?.some((value) => dialNumber(value) === phone))
        throw new Error("This number is suppressed. Calling is blocked.");
      // A default Supabase row limit must not hide suppressed contacts later in the workspace.
      for (let offset = 0; ; offset += 500) {
        const result = await supabase
          .from("leads")
          .select("id,phone_normalized,outcome,metadata_json")
          .eq("workspace_id", data.workspaceId)
          .order("id")
          .range(offset, offset + 499);
        if (result.error)
          throw new Error("Do-not-call protection could not be checked. No call was started.");
        if (
          result.data?.some((lead) => {
            const extra = (
              lead.metadata_json as {
                callboard?: {
                  suppressed?: boolean;
                  direct?: string;
                  contacts?: { phone: string }[];
                };
              } | null
            )?.callboard;
            return (
              (lead.outcome === "do_not_call" || extra?.suppressed) &&
              [
                lead.phone_normalized,
                extra?.direct,
                ...(extra?.contacts ?? []).map((contact) => contact.phone),
              ].some((value) => value && dialNumber(value) === phone)
            );
          })
        )
          throw new Error("This number is suppressed. Calling is blocked.");
        if (!result.data || result.data.length < 500) break;
        if (offset >= 100000)
          throw new Error(
            "Do-not-call protection could not inspect the full workspace. No call was started.",
          );
      }
    }
    const { data: settings, error: settingsError } = await supabase
      .from("workspace_settings")
      .select("twilio_account_sid,twilio_auth_token,twilio_phone_number")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (
      settingsError ||
      !settings?.twilio_account_sid ||
      !settings.twilio_auth_token ||
      !settings.twilio_phone_number
    )
      throw new Error("Configure Twilio in the original Settings page first.");
    const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(settings.twilio_account_sid)}`;
    async function request<T>(path: string, values?: Record<string, string>): Promise<T> {
      const response = await fetch(base + path, {
        method: values ? "POST" : "GET",
        headers: {
          Authorization: `Basic ${btoa(`${settings!.twilio_account_sid}:${settings!.twilio_auth_token}`)}`,
          ...(values ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        ...(values ? { body: new URLSearchParams(values).toString() } : {}),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(`Calling provider could not complete the request (${response.status}).`);
      return response.json() as Promise<T>;
    }
    async function markEnded() {
      const saved = await registry()
        .update({ ended: true })
        .eq("id", data.attemptId)
        .eq("workspace_id", data.workspaceId);
      if (saved.error)
        throw new Error(
          "The call ended but its state could not be saved. Refresh before dialing again.",
        );
    }
    const found = await request<{ conferences: { sid: string }[] }>(
      `/Conferences.json?FriendlyName=${encodeURIComponent(conferenceName(data.workspaceId, data.attemptId))}&Status=in-progress&PageSize=20`,
    );
    const conference = found.conferences[0];
    if (!conference) {
      if (data.operation === "state" || data.operation === "end") {
        return controlConference({ operation: "end" }, legs, null, settings.twilio_phone_number, {
          request,
          markEnded,
          saveLegs: async () => {},
        });
      }
      throw new Error("The browser is still joining the call. Try again in a moment.");
    }
    return controlConference(
      {
        operation: data.operation,
        ...(phone ? { phone } : {}),
        ...(data.held === undefined ? {} : { held: data.held }),
        ...(data.primary === undefined ? {} : { primary: data.primary }),
      },
      legs,
      conference.sid,
      settings.twilio_phone_number,
      {
        request,
        markEnded,
        async saveLegs(next) {
          // Merge concurrent contact additions rather than losing a provider call leg.
          for (let retry = 0; retry < 4; retry++) {
            const latest = await registry()
              .select("*")
              .eq("id", data.attemptId)
              .eq("workspace_id", data.workspaceId)
              .maybeSingle();
            const current = latest.data as unknown as {
              ended: boolean;
              user_id: string;
              legs: StoredVoiceLeg[];
            } | null;
            if (latest.error || !current || current.user_id !== userId || current.ended)
              throw new Error(
                "The call changed while adding this contact. End the call before retrying.",
              );
            const merged = [...current.legs];
            for (const leg of next) {
              const index = merged.findIndex((item) => item.phone === leg.phone);
              if (index < 0) merged.push(leg);
              else if ((leg.generation ?? 1) >= (merged[index]!.generation ?? 1))
                merged[index] = leg;
            }
            const saved = await registry()
              .update({ legs: JSON.parse(JSON.stringify(merged)) as Json })
              .eq("id", data.attemptId)
              .eq("workspace_id", data.workspaceId)
              .eq("legs", JSON.stringify(current.legs))
              .eq("ended", false)
              .select("id");
            if (saved.error) break;
            if (saved.data?.length) return;
          }
          throw new Error(
            "The provider accepted the contact but its state could not be saved. End the call before retrying.",
          );
        },
      },
    );
  });
