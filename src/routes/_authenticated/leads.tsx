import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Upload, ListPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDialer } from "@/hooks/useDialer";
import { PageHeader } from "@/components/AppShell";
import { ImportDialog } from "@/components/ImportDialog";
import { OutcomeBadge } from "@/routes/_authenticated/calls";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { OUTCOMES, STATUSES, statusLabel } from "@/lib/outcomes";
import { formatPhone } from "@/lib/phone";
import { deriveLeadZone, formatTimeInZone, zoneAbbreviation } from "@/lib/timezones";
import { applyLeadFilters, createSessionFromFilters } from "@/lib/sessions";
import type { LeadFilters } from "@/lib/sessions";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Call Board" },
      {
        name: "description",
        content: "Import, filter and dial local service business leads, de-duplicated by phone.",
      },
      { property: "og:title", content: "Leads — Call Board" },
      { property: "og:description", content: "Your de-duplicated cold-calling lead database." },
    ],
  }),
  component: LeadsPage,
});

const PAGE = 50;

function LeadsPage() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const dialer = useDialer();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [filters, setFilters] = useState<LeadFilters>({});
  const [page, setPage] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const now = new Date();

  const set = (patch: Partial<LeadFilters>) => {
    setPage(0);
    setFilters({ ...filters, ...patch });
  };

  const { data, isFetching } = useQuery({
    queryKey: ["leads", workspace?.id, filters, page],
    enabled: !!workspace,
    queryFn: async () => {
      const base = supabase
        .from("leads")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      const { data, count, error } = await applyLeadFilters(base, filters);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;

  const startSession = async () => {
    if (!workspace || !user) return;
    setCreating(true);
    try {
      const name = `Session ${new Date().toLocaleString()}`;
      const { sessionId, queued } = await createSessionFromFilters(
        workspace.id,
        user.id,
        name,
        filters,
      );
      toast.success(`${queued} unique leads queued`);
      void navigate({ to: "/sessions/$sessionId", params: { sessionId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create session");
    } finally {
      setCreating(false);
    }
  };

  const runDelete = async (ids: string[]) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Deleted ${ids.length} lead${ids.length === 1 ? "" : "s"}`);
      setSelected((s) => s.filter((id) => !ids.includes(id)));
      setConfirmDelete(null);
      void qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete leads");
    } finally {
      setDeleting(false);
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={`${total} leads match the current filter.`}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!workspace) {
                  toast.error("Workspace still loading — try again in a moment");
                  return;
                }
                setImportOpen(true);
              }}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Import CSV
            </Button>
            {selected.length > 0 && (
              <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(selected)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete selected ({selected.length})
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void startSession()}
              disabled={creating || total === 0}
            >
              <ListPlus className="mr-1.5 h-3.5 w-3.5" />
              {creating ? "Building…" : "Start session from filter"}
            </Button>
          </>
        }
      />

      <div className="panel mb-3 flex flex-wrap items-center gap-2 p-2">
        <Input
          placeholder="Search name, city or number…"
          value={filters.search ?? ""}
          onChange={(e) => set({ search: e.target.value })}
          className="h-8 w-64 text-xs"
        />
        <select
          value={filters.status ?? ""}
          onChange={(e) => set({ status: e.target.value })}
          className="h-8 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filters.outcome ?? ""}
          onChange={(e) => set({ outcome: e.target.value, neverCalled: false })}
          className="h-8 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        >
          <option value="">All outcomes</option>
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Input
          placeholder="State"
          value={filters.state ?? ""}
          onChange={(e) => set({ state: e.target.value })}
          className="h-8 w-24 text-xs"
        />
        <Input
          placeholder="City"
          value={filters.city ?? ""}
          onChange={(e) => set({ city: e.target.value })}
          className="h-8 w-32 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!!filters.neverCalled}
            onChange={(e) =>
              set({ neverCalled: e.target.checked, ...(e.target.checked ? { outcome: "" } : {}) })
            }
            className="accent-[var(--color-primary)]"
          />
          Never called
        </label>
        <button
          onClick={() => {
            setPage(0);
            setFilters({});
          }}
          className="ml-auto text-xs text-muted-foreground hover:text-primary"
        >
          Clear filters
        </button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">
                <input
                  type="checkbox"
                  aria-label="Select all leads"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                  className="accent-[var(--color-primary)]"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Business</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Phone</th>
              <th className="px-3 py-2 text-left font-medium">Location</th>
              <th className="px-3 py-2 text-left font-medium">Local time</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Outcome</th>
              <th className="px-3 py-2 text-right font-medium">Calls</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-xs text-muted-foreground">
                  No leads yet — import a CSV to get started.
                </td>
              </tr>
            )}
            {rows.map((l) => {
              const zone = deriveLeadZone(l.state, l.phone).zone;
              return (
                <tr
                  key={l.id}
                  className="border-b border-border/60 transition-colors hover:bg-surface-raised"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.business_name}`}
                      checked={selected.includes(l.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked ? [...s, l.id] : s.filter((id) => id !== l.id),
                        )
                      }
                      className="accent-[var(--color-primary)]"
                    />
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 font-medium">
                    {l.business_name}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-xs">
                    {l.owner_name || "—"}
                  </td>
                  <td className="mono px-3 py-2 text-xs">{formatPhone(l.phone)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {[l.city, l.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="mono px-3 py-2 text-xs">
                    {formatTimeInZone(now, zone)}{" "}
                    <span className="text-muted-foreground">{zoneAbbreviation(now, zone)}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{statusLabel(l.status)}</td>
                  <td className="px-3 py-2">
                    <OutcomeBadge value={l.outcome} />
                  </td>
                  <td className="mono px-3 py-2 text-right text-xs">{l.call_count}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void dialer.dial({
                            phone: l.phone,
                            leadId: l.id,
                            businessName: l.business_name,
                            ownerName: l.owner_name,
                            state: l.state,
                          })
                        }
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Delete ${l.business_name}`}
                        onClick={() => setConfirmDelete([l.id])}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="mono">
          {total === 0 ? 0 : page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
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

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length ?? 0} lead
              {(confirmDelete?.length ?? 0) === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the lead{(confirmDelete?.length ?? 0) === 1 ? "" : "s"} from
              this workspace. Call history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) void runDelete(confirmDelete);
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {workspace && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          workspaceId={workspace.id}
          onImported={() => {
            void qc.invalidateQueries({ queryKey: ["leads"] });
            void qc.invalidateQueries({ queryKey: ["lead-counts"] });
          }}
        />
      )}
    </div>
  );
}
