import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Phone, SkipForward, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDialer } from "@/hooks/useDialer";
import { PageHeader } from "@/components/AppShell";
import { CompactTz } from "@/components/CompactTz";
import { Button } from "@/components/ui/button";
import { formatDuration, statusForOutcome } from "@/lib/outcomes";
import type { Outcome } from "@/lib/outcomes";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId")({
  head: () => ({
    meta: [
      { title: "Session — Call Board" },
      {
        name: "description",
        content: "Sequential auto-dialer with per-call dispositions and queue progress.",
      },
      { property: "og:title", content: "Session — Call Board" },
      { property: "og:description", content: "Run a de-duplicated calling queue end to end." },
    ],
  }),
  component: SessionPage,
});

type QueueRow = {
  id: string;
  status: string;
  outcome: string | null;
  queue_position: number;
  lead_id: string;
  leads: {
    id: string;
    business_name: string;
    owner_name: string | null;
    phone: string;
    city: string | null;
    state: string | null;
    notes: string | null;
  } | null;
};

const DISPOSITION_GROUPS = [
  {
    label: "Attempt outcomes",
    items: [
      { key: "1", label: "No Answer", value: "no_answer", accent: "border-l-muted-foreground/50" },
      { key: "2", label: "Voicemail", value: "voicemail", accent: "border-l-muted-foreground/50" },
      { key: "3", label: "Hung Up", value: "busy", accent: "border-l-warning" },
      { key: "4", label: "Gatekeeper", value: "connected_gk", accent: "border-l-primary" },
      { key: "5", label: "Wrong/DC", value: "bad_number", accent: "border-l-destructive" },
    ],
  },
  {
    label: "Conversation outcomes",
    items: [
      { key: "Q", label: "Not Interested", value: "not_interested", accent: "border-l-destructive" },
      { key: "W", label: "Callback Later", value: "callback_requested", accent: "border-l-warning" },
      { key: "E", label: "Appt Booked", value: "appointment_set", accent: "border-l-success" },
      { key: "R", label: "Left Live Msg", value: "connected_other", accent: "border-l-primary" },
      { key: "T", label: "DNC", value: "do_not_call", accent: "border-l-destructive" },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ key: string; label: string; value: Outcome; accent: string }>;
}>;

function SessionPage() {
  const { sessionId } = Route.useParams();
  const { workspace } = useWorkspace();
  const dialer = useDialer();
  const qc = useQueryClient();
  const [auto, setAuto] = useState(false);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calling_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: queue } = useQuery({
    queryKey: ["session-queue", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_leads")
        .select("id, status, outcome, queue_position, lead_id, leads(id, business_name, owner_name, phone, city, state, notes)")
        .eq("session_id", sessionId)
        .order("queue_position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
  });

  const rows = useMemo(() => queue ?? [], [queue]);
  const current = rows.find((r) => r.status === "queued" || r.status === "dialing") ?? null;
  const done = rows.filter((r) => r.status === "done" || r.status === "skipped").length;
  const idle = dialer.status === "idle" || dialer.status === "offline";

  const dialCurrent = useCallback(async () => {
    if (!current?.leads) return;
    await supabase.from("session_leads").update({ status: "dialing" }).eq("id", current.id);
    await dialer.dial({
      phone: current.leads.phone,
      leadId: current.leads.id,
      businessName: current.leads.business_name,
      ownerName: current.leads.owner_name,
      state: current.leads.state,
      sessionId,
    });
    if (session?.status === "pending") {
      await supabase.from("calling_sessions").update({ status: "active" }).eq("id", sessionId);
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    }
  }, [current, dialer, sessionId, session?.status, qc]);

  /* When a call ends, hold the queue until the rep dispositions it. */
  useEffect(() => {
    if (dialer.lastCall && dialer.lastCall.sessionId === sessionId) {
      setPendingLogId(dialer.lastCall.logId);
      dialer.clearLastCall();
    }
  }, [dialer, sessionId]);

  /* Sequential auto-dial: only advances once the previous call is dispositioned. */
  useEffect(() => {
    if (!auto || pendingLogId || !current || !idle) return;
    const t = setTimeout(() => void dialCurrent(), 1500);
    return () => clearTimeout(t);
  }, [auto, pendingLogId, current, idle, dialCurrent]);

  const disposition = async (outcome: Outcome) => {
    if (!current) return;
    try {
      let logId = pendingLogId;
      if (!logId && current.lead_id) {
        // Fallback: the call ended before its log id reached this screen —
        // attach the outcome to the most recent call for this lead in this session.
        const { data: recent } = await supabase
          .from("dial_call_logs")
          .select("id")
          .eq("session_id", sessionId)
          .eq("lead_id", current.lead_id)
          .order("called_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        logId = recent?.id ?? null;
      }
      if (logId) {
        await supabase.from("dial_call_logs").update({ outcome }).eq("id", logId);
      }
      await Promise.all([
        supabase.from("session_leads").update({ status: "done", outcome }).eq("id", current.id),
        supabase
          .from("leads")
          .update({ outcome, status: statusForOutcome(outcome) })
          .eq("id", current.lead_id),
        supabase
          .from("calling_sessions")
          .update({ completed_leads: done + 1 })
          .eq("id", sessionId),
      ]);
      setPendingLogId(null);
      void qc.invalidateQueries({ queryKey: ["session-queue", sessionId] });
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save outcome");
    }
  };

  const skip = async () => {
    if (!current) return;
    await supabase.from("session_leads").update({ status: "skipped" }).eq("id", current.id);
    setPendingLogId(null);
    void qc.invalidateQueries({ queryKey: ["session-queue", sessionId] });
  };

  const finish = async () => {
    setAuto(false);
    await supabase.from("calling_sessions").update({ status: "completed" }).eq("id", sessionId);
    void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    toast.success("Session closed");
  };

  /* Notes are scoped to the lead currently on screen, keyed by its phone number. */
  useEffect(() => {
    const phone = current?.leads?.phone ?? null;
    if (phone !== noteFor) {
      setNoteFor(phone);
      setNoteDraft(current?.leads?.notes ?? "");
    }
  }, [current?.leads?.phone, current?.leads?.notes, noteFor]);

  const saveNote = async () => {
    if (!current?.leads) return;
    if ((current.leads.notes ?? "") === noteDraft) return;
    setSavingNote(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ notes: noteDraft || null })
        .eq("id", current.leads.id);
      if (error) throw error;
      void qc.invalidateQueries({ queryKey: ["session-queue", sessionId] });
      toast.success("Note saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setSavingNote(false);
    }
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) if (r.outcome) m[r.outcome] = (m[r.outcome] ?? 0) + 1;
    return m;
  }, [rows]);

  const pct = rows.length ? (done / rows.length) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={session?.name ?? "Session"}
        subtitle={`${done} of ${rows.length} leads handled · ${workspace?.name ?? ""}`}
        actions={
          <>
            <Link to="/sessions">
              <Button size="sm" variant="outline">
                All sessions
              </Button>
            </Link>
            <Button size="sm" variant={auto ? "secondary" : "default"} onClick={() => setAuto(!auto)}>
              {auto ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              {auto ? "Pause auto-dial" : "Start auto-dial"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void finish()}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> End session
            </Button>
          </>
        }
      />

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded bg-surface-raised">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel p-5">
          {!current ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium">Queue complete</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Every lead in this session has been handled.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {current.leads?.business_name}
                  </h2>
                  {current.leads?.owner_name && (
                    <div className="mt-1 inline-flex items-center gap-2 rounded-md border-l-2 border-success bg-success/10 px-2.5 py-1">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Owner
                      </span>
                      <span className="text-sm font-semibold">{current.leads.owner_name}</span>
                    </div>
                  )}
                  <div className="mono mt-1 text-lg text-primary">
                    {formatPhone(current.leads?.phone ?? "")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[current.leads?.city, current.leads?.state].filter(Boolean).join(", ") || "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Position
                  </div>
                  <div className="mono text-lg">
                    {current.queue_position + 1}/{rows.length}
                  </div>
                  {dialer.status !== "idle" && dialer.status !== "offline" && (
                    <div className="mono mt-1 text-xs text-primary">
                      {formatDuration(dialer.durationSeconds)}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Notes for {formatPhone(current.leads?.phone ?? "")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingNote}
                    onClick={() => void saveNote()}
                  >
                    {savingNote ? "Saving…" : "Save note"}
                  </Button>
                </div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => void saveNote()}
                  rows={3}
                  placeholder="Anything worth remembering next time this lead comes up…"
                  className="w-full rounded-md border border-border bg-background p-2 text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="mt-4 flex gap-2">
                <Button onClick={() => void dialCurrent()} disabled={!idle}>
                  <Phone className="mr-1.5 h-4 w-4" /> Dial lead
                </Button>
                <Button variant="outline" onClick={() => void skip()}>
                  <SkipForward className="mr-1.5 h-4 w-4" /> Skip
                </Button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {pendingLogId ? "Disposition this call to continue" : "Quick disposition"}
                </div>
                {DISPOSITION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {group.items.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => void disposition(item.value)}
                          className={cn(
                            "relative rounded-lg border border-l-4 bg-background p-3 text-left transition-colors hover:bg-surface-raised",
                            item.accent,
                          )}
                        >
                          <span className="absolute right-2 top-2 rounded border border-border px-1 text-[10px] uppercase text-muted-foreground">
                            {item.key}
                          </span>
                          <div className="mono text-2xl font-semibold leading-none">
                            {counts[item.value] ?? 0}
                          </div>
                          <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                            {item.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <CompactTz state={current?.leads?.state ?? null} phone={current?.leads?.phone ?? null} />

          <div className="panel max-h-[520px] overflow-y-auto">
            <div className="sticky top-0 border-b border-border bg-surface px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Queue
            </div>
            {rows.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center gap-2 border-b border-border/50 px-3 py-1.5 text-xs last:border-0",
                  r.id === current?.id && "bg-primary/10",
                )}
              >
                <span className="mono w-6 text-muted-foreground">{r.queue_position + 1}</span>
                <span className="flex-1 truncate">{r.leads?.business_name}</span>
                <span
                  className={cn(
                    "text-[10px] uppercase",
                    r.status === "done" && "text-primary",
                    r.status === "skipped" && "text-muted-foreground",
                    r.status === "dialing" && "text-warning",
                    r.status === "queued" && "text-muted-foreground",
                  )}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
