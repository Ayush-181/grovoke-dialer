import { useEffect, useState } from "react";
import {
  Delete,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Settings2,
  Users,
  X,
  Grid3x3,
} from "lucide-react";
import { useDialer } from "@/hooks/useDialer";
import { useWorkspace } from "@/hooks/useWorkspace";
import { formatDuration } from "@/lib/outcomes";
import { formatPhone } from "@/lib/phone";
import { CompactTz } from "@/components/CompactTz";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function PhoneWidget() {
  const dialer = useDialer();
  const { workspace } = useWorkspace();
  const [number, setNumber] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [anchorZone, setAnchorZone] = useState("Asia/Kolkata");

  const active =
    dialer.status === "connecting" || dialer.status === "live" || dialer.status === "conferencing";

  useEffect(() => {
    void supabase
      .from("user_preferences")
      .select("default_anchor_zone")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.default_anchor_zone) setAnchorZone(data.default_anchor_zone);
      });
  }, [workspace?.id]);

  useEffect(() => {
    if (active) dialer.setWidgetOpen(true);
  }, [active, dialer]);

  const press = (key: string) => {
    if (active) dialer.sendDigit(key);
    else setNumber((n) => (n + key).slice(0, 20));
  };

  if (!workspace) return null;

  if (!dialer.widgetOpen) {
    return (
      <button
        onClick={() => dialer.setWidgetOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110"
        aria-label="Open dial pad"
      >
        <Phone className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="panel fixed bottom-6 right-6 z-50 w-[320px] shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              dialer.status === "idle" && "bg-primary",
              dialer.status === "offline" && "bg-muted-foreground",
              dialer.status === "connecting" && "bg-warning live-dot",
              (dialer.status === "live" || dialer.status === "conferencing") &&
                "bg-primary live-dot",
            )}
          />
          <span className="mono text-xs uppercase tracking-widest text-muted-foreground">
            {dialer.status}
          </span>
          {active && (
            <span className="mono text-xs text-foreground">
              {formatDuration(dialer.durationSeconds)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Audio settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => dialer.setWidgetOpen(false)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Minimise dial pad"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {dialer.status === "offline" && (
          <div className="space-y-2">
            {dialer.error && <p className="text-xs text-destructive">{dialer.error}</p>}
            <Button size="sm" className="w-full" onClick={() => void dialer.connect()}>
              Connect phone
            </Button>
          </div>
        )}

        {showSettings && (
          <div className="space-y-1 rounded border border-border bg-background p-2">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Microphone
            </label>
            <select
              value={dialer.selectedInput ?? "default"}
              onChange={(e) => void dialer.setInputDevice(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
            >
              <option value="default">System default</option>
              {dialer.inputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <CompactTz
          anchorZone={anchorZone}
          state={dialer.target?.state ?? null}
          phone={dialer.target?.phone ?? number}
        />

        <div className="rounded border border-border bg-background px-3 py-2">
          <div className="mono truncate text-lg">
            {active ? formatPhone(dialer.target?.phone ?? "") : formatPhone(number) || number || "—"}
          </div>
          {dialer.target?.businessName && (
            <div className="truncate text-xs text-muted-foreground">
              {dialer.target.businessName}
            </div>
          )}
        </div>

        {dialer.target?.ownerName && (
          <div className="rounded border-l-2 border-success bg-success/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Owner
            </div>
            <div className="truncate text-sm font-semibold">{dialer.target.ownerName}</div>
          </div>
        )}

        {/* DTMF keypad — visible from connecting through live/conferencing */}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="mono rounded border border-border bg-surface-raised py-2 text-sm transition hover:border-primary hover:text-primary"
            >
              {k}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!active ? (
            <>
              <Button
                className="flex-1"
                disabled={!number}
                onClick={() => void dialer.dial({ phone: number })}
              >
                <Phone className="mr-2 h-4 w-4" /> Call
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setNumber((n) => n.slice(0, -1))}
                aria-label="Backspace"
              >
                <Delete className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={dialer.muted ? "secondary" : "outline"}
                size="icon"
                onClick={dialer.toggleMute}
                aria-label="Mute"
              >
                {dialer.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Conference"
                onClick={() =>
                  void dialer.dial({
                    phone: dialer.target?.phone ?? number,
                    mode: "conference",
                    conferenceName: `cb_${workspace.id.slice(0, 8)}`,
                  })
                }
                disabled={dialer.status === "conferencing"}
              >
                <Users className="h-4 w-4" />
              </Button>
              <Button variant="destructive" className="flex-1" onClick={dialer.hangup}>
                <PhoneOff className="mr-2 h-4 w-4" /> Hang up
              </Button>
            </>
          )}
        </div>

        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Grid3x3 className="h-3 w-3" /> Keypad stays live for IVR menus during the whole call.
        </p>
      </div>
    </div>
  );
}
