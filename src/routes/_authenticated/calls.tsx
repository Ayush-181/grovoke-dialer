import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, PhoneOutgoing } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDialer } from "@/hooks/useDialer";
import { PageHeader } from "@/components/AppShell";
import { RecordingPlayer } from "@/components/RecordingPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OUTCOMES, formatDuration, outcomeLabel, outcomeTone, statusForOutcome } from "@/lib/outcomes";
import type { Outcome } from "@/lib/outcomes";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({
    meta: [
      { title: "Call Log — Call Board" },
      {
        name: "description",
        content: "Every dial with duration, outcome, notes and recording playback.",
      },
      { property: "og:title", content: "Call Log — Call Board" },
      { property: "og:description", content: "Searchable call history with recordings." },
    ],
  }),
  component: CallsPage,
});

const PAGE = 50;

export function OutcomeBadge({ value }: { value?: string | null }) {
  const tone = outcomeTone(value);
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        tone === "good" && "bg-primary/15 text-primary",
        tone === "warn" && "bg-warning/15 text-warning",
        tone === "bad" && "bg-destructive/15 text-destructive",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {outcomeLabel(value)}
    </span>
  );
}

function CallsPage() {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const [direction, setDirection] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["calls", workspace?.id, page, search, outcome, direction],
    enabled: !!workspace,
    queryFn: async () => {
      let q = supabase
        .from("dial_call_logs")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspace!.id)
        .order("called_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`business_name.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      if (outcome) q = q.eq("outcome", outcome as Outcome);
      if (direction) q = q.eq("direction", direction);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;

  const saveRow = async (id: string, patch: { outcome?: Outcome; notes?: string }, leadId: string | null) => {
    const { error } = await supabase.from("dial_call_logs").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (patch.outcome && leadId) {
      await supabase
        .from("leads")
        .update({ outcome: patch.outcome, status: statusForOutcome(patch.outcome) })
        .eq("id", leadId);
    }
    toast.success("Call updated");
    void qc.invalidateQueries({ queryKey: ["calls"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div>
      <PageHeader
        title="Call Log"
        subtitle={`${total} calls recorded in this workspace.`}
        actions={
          <>
            <Input
              placeholder="Search business or number…"
              value={search}
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
              className="h-8 w-56 text-xs"
            />
            <select
              value={direction}
              onChange={(e) => {
                setPage(0);
                setDirection(e.target.value);
              }}
              className="h-8 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">All directions</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <select
              value={outcome}
              onChange={(e) => {
                setPage(0);
                setOutcome(e.target.value);
              }}
              className="h-8 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">All outcomes</option>
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        }
      />

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">Business</th>
              <th className="px-3 py-2 text-left font-medium">Number</th>
              <th className="px-3 py-2 text-left font-medium">Duration</th>
              <th className="px-3 py-2 text-left font-medium">Outcome</th>
              <th className="px-3 py-2 text-right font-medium">Recording</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-xs text-muted-foreground">
                  No calls match these filters yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <>
                <tr
                  key={r.id}
                  onClick={() => {
                    setOpenId(openId === r.id ? null : r.id);
                    setNoteDraft(r.notes ?? "");
                  }}
                  className="cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-raised"
                >
                  <td className="mono whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.called_at).toLocaleString()}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2">{r.business_name ?? "—"}</td>
                  <td className="mono px-3 py-2 text-xs">
                    <span className="flex items-center gap-1">
                      {r.direction === "inbound" ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-success" aria-label="Inbound" />
                      ) : (
                        <ArrowUpRight
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-label="Outbound"
                        />
                      )}
                      {formatPhone(r.phone)}
                    </span>
                  </td>
                  <td className="mono px-3 py-2 text-xs">{formatDuration(r.duration_seconds)}</td>
                  <td className="px-3 py-2">
                    <OutcomeBadge value={r.outcome} />
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {r.recording_url ? "audio" : "—"}
                  </td>
                </tr>
                {openId === r.id && (
                  <tr key={`${r.id}-detail`} className="border-b border-border bg-surface">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Outcome
                          </label>
                          <div className="flex flex-wrap gap-1">
                            {OUTCOMES.map((o) => (
                              <button
                                key={o.value}
                                onClick={() => void saveRow(r.id, { outcome: o.value }, r.lead_id)}
                                className={cn(
                                  "rounded border px-2 py-1 text-[11px] transition-colors",
                                  r.outcome === o.value
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                                )}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Notes
                          </label>
                          <textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            rows={3}
                            className="w-full rounded border border-border bg-background p-2 text-xs outline-none focus:border-primary"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void saveRow(r.id, { notes: noteDraft }, r.lead_id)}
                          >
                            Save notes
                          </Button>
                          {r.recording_url && <RecordingPlayer callLogId={r.id} />}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="mono">
          {total === 0 ? 0 : page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * PAGE >= total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
