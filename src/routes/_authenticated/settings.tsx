import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDialer } from "@/hooks/useDialer";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ZONES } from "@/lib/timezones";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Call Board" },
      {
        name: "description",
        content: "Configure workspace name, telephony credentials, microphone and anchor zone.",
      },
      { property: "og:title", content: "Settings — Call Board" },
      { property: "og:description", content: "Workspace, telephony and audio configuration." },
    ],
  }),
  component: SettingsPage,
});

const TWILIO_FIELDS = [
  { key: "twilio_account_sid", label: "Account SID", secret: false },
  { key: "twilio_auth_token", label: "Auth Token", secret: true },
  { key: "twilio_api_key_sid", label: "API Key SID", secret: false },
  { key: "twilio_api_key_secret", label: "API Key Secret", secret: true },
  { key: "twilio_twiml_app_sid", label: "TwiML App SID", secret: false },
  { key: "twilio_phone_number", label: "Caller ID number (E.164)", secret: false },
] as const;

function SettingsPage() {
  const { user } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const dialer = useDialer();
  const qc = useQueryClient();

  const [wsName, setWsName] = useState("");
  const [fullName, setFullName] = useState("");
  const [anchorZone, setAnchorZone] = useState("Asia/Kolkata");
  const [twilio, setTwilio] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => setWsName(workspace?.name ?? ""), [workspace?.name]);

  const { data } = useQuery({
    queryKey: ["settings", workspace?.id],
    enabled: !!workspace,
    queryFn: async () => {
      const [settings, prefs, profile] = await Promise.all([
        supabase
          .from("workspace_settings")
          .select("*")
          .eq("workspace_id", workspace!.id)
          .maybeSingle(),
        supabase.from("user_preferences").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
      ]);
      return {
        settings: settings.data,
        prefs: prefs.data,
        profile: profile.data,
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const s = data.settings as Record<string, string | null> | null;
    if (s) {
      const next: Record<string, string> = {};
      for (const f of TWILIO_FIELDS) next[f.key] = s[f.key] ?? "";
      setTwilio(next);
    }
    if (data.prefs?.default_anchor_zone) setAnchorZone(data.prefs.default_anchor_zone);
    setFullName(data.profile?.full_name ?? "");
  }, [data]);

  const save = async () => {
    if (!workspace || !user) return;
    setSaving(true);
    try {
      const t = (key: string) => twilio[key]?.trim() || null;

      const [a, b, c, d] = await Promise.all([
        supabase.from("workspaces").update({ name: wsName.trim() || "Workspace" }).eq("id", workspace.id),
        supabase.from("workspace_settings").upsert(
          {
            workspace_id: workspace.id,
            twilio_account_sid: t("twilio_account_sid"),
            twilio_auth_token: t("twilio_auth_token"),
            twilio_api_key_sid: t("twilio_api_key_sid"),
            twilio_api_key_secret: t("twilio_api_key_secret"),
            twilio_twiml_app_sid: t("twilio_twiml_app_sid"),
            twilio_phone_number: t("twilio_phone_number"),
          },
          { onConflict: "workspace_id" },
        ),
        supabase
          .from("user_preferences")
          .upsert(
            { user_id: user.id, default_anchor_zone: anchorZone, mic_device_id: dialer.selectedInput },
            { onConflict: "user_id" },
          ),
        supabase
          .from("profiles")
          .upsert({ id: user.id, email: user.email ?? null, full_name: fullName }),
      ]);
      const err = a.error || b.error || c.error || d.error;
      if (err) throw err;
      toast.success("Settings saved");
      refresh();
      void qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Workspace, telephony credentials and audio devices."
        actions={
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <section className="panel mb-4 space-y-3 p-4">
        <h2 className="text-sm font-semibold">Workspace &amp; profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Workspace name</Label>
            <Input value={wsName} onChange={(e) => setWsName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Your name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="panel mb-4 space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">Telephony (Twilio)</h2>
          <p className="text-xs text-muted-foreground">
            Stored per workspace and only read server-side when minting browser call tokens. Point
            your TwiML App voice URL at{" "}
            <code className="mono text-primary">/api/public/twiml/voice</code>.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TWILIO_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type={f.secret ? "password" : "text"}
                value={twilio[f.key] ?? ""}
                onChange={(e) => setTwilio({ ...twilio, [f.key]: e.target.value })}
                className="mono text-xs"
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">Audio &amp; clock</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Microphone</Label>
            <select
              value={dialer.selectedInput ?? "default"}
              onChange={(e) => void dialer.setInputDevice(e.target.value)}
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            >
              <option value="default">System default</option>
              {dialer.inputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default anchor zone</Label>
            <select
              value={anchorZone}
              onChange={(e) => setAnchorZone(e.target.value)}
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
