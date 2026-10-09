import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  Upload,
  ListPlus,
  Trash2,
  Search,
  SlidersHorizontal,
  Loader2,
  AlertCircle,
} from "lucide-react";
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
    setSelected([]);
    setFilters((current) => ({ ...current, ...patch }));
  };

  const { data, isFetching, isPending, isError, refetch } = useQuery({
    queryKey: ["leads", workspace?.id, filters, page],
    enabled: !!workspace,
    placeholderData: keepPreviousData,
    retry: 1,
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
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => {
    setPage(0);
    setSelected([]);
    setFilters({});
  };
  const changePage = (next: number) => {
    setSelected([]);
    setPage(next);
  };

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
        subtitle="Find the right contact, check their local time, and keep your next call in view."
        actions={
          <>
            <Button
              size="sm"
              className="h-11 sm:h-9"
              variant="outline"
              onClick={() => {
                if (!workspace) {
                  toast.error("Workspace still loading — try again in a moment");
                  return;
                }
                setImportOpen(true);
              }}
            >
              <Upload aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Import CSV
            </Button>
            <Button
              size="sm"
              onClick={() => void startSession()}
              disabled={creating || isFetching || isPending || isError || total === 0}
              className="h-11 flex-1 sm:h-9 sm:flex-none"
            >
              <ListPlus aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              {creating ? "Building…" : "Start session from filter"}
            </Button>
          </>
        }
      />

      <section aria-labelledby="lead-filters-title" className="panel mb-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="lead-filters-title" className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            Filter leads
            {activeFilterCount > 0 && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs tabular-nums text-primary">
                {activeFilterCount} active
              </span>
            )}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFilters}
            disabled={!activeFilterCount}
            className="h-11 sm:h-9"
          >
            Clear filters
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(240px,2fr)_repeat(4,minmax(120px,1fr))]">
          <div className="col-span-2 xl:col-span-1">
            <label htmlFor="lead-search" className="mb-1.5 block text-xs font-medium">
              Search leads
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
              />
              <Input
                id="lead-search"
                name="lead-search"
                autoComplete="off"
                type="search"
                placeholder="Business, city or phone…"
                value={filters.search ?? ""}
                onChange={(e) => set({ search: e.target.value })}
                className="h-11 pl-9 sm:h-10"
              />
            </div>
          </div>
          <div>
            <label htmlFor="lead-status" className="mb-1.5 block text-xs font-medium">
              Status
            </label>
            <select
              id="lead-status"
              name="lead-status"
              value={filters.status ?? ""}
              onChange={(e) => set({ status: e.target.value })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
            >
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lead-outcome" className="mb-1.5 block text-xs font-medium">
              Outcome
            </label>
            <select
              id="lead-outcome"
              name="lead-outcome"
              value={filters.outcome ?? ""}
              onChange={(e) => set({ outcome: e.target.value, neverCalled: false })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
            >
              <option value="">All outcomes</option>
              {OUTCOMES.map((outcome) => (
                <option key={outcome.value} value={outcome.value}>
                  {outcome.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lead-state" className="mb-1.5 block text-xs font-medium">
              State
            </label>
            <Input
              id="lead-state"
              name="lead-state"
              autoComplete="off"
              placeholder="e.g. NY…"
              value={filters.state ?? ""}
              onChange={(e) => set({ state: e.target.value })}
              className="h-11 sm:h-10"
            />
          </div>
          <div>
            <label htmlFor="lead-city" className="mb-1.5 block text-xs font-medium">
              City
            </label>
            <Input
              id="lead-city"
              name="lead-city"
              autoComplete="off"
              placeholder="e.g. New York…"
              value={filters.city ?? ""}
              onChange={(e) => set({ city: e.target.value })}
              className="h-11 sm:h-10"
            />
          </div>
        </div>
        <label className="mt-3 flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md text-sm sm:min-h-8">
          <input
            type="checkbox"
            checked={!!filters.neverCalled}
            onChange={(e) =>
              set({ neverCalled: e.target.checked, ...(e.target.checked ? { outcome: "" } : {}) })
            }
            className="h-4 w-4 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          Never called
          <span className="text-xs text-muted-foreground">No outcome recorded</span>
        </label>
      </section>

      <section aria-label="Lead results" className="panel min-w-0 overflow-hidden">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div role="status" className="flex items-center gap-2 text-sm">
            <span className="font-medium">
              {isPending
                ? "Loading leads…"
                : isError
                  ? "Leads unavailable"
                  : `${total.toLocaleString()} leads`}
            </span>
            {isFetching && !isPending && (
              <span className="text-xs text-muted-foreground">Updating…</span>
            )}
            {selected.length > 0 && (
              <span className="text-xs text-primary">{selected.length} selected</span>
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected([])}
                className="h-11 sm:h-9"
              >
                Clear selection
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmDelete(selected)}
                className="h-11 text-destructive sm:h-9"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" /> Delete selected
              </Button>
            </div>
          )}
        </div>
        <div
          role="region"
          aria-label="Lead table, scroll horizontally for more columns"
          tabIndex={0}
          className="overflow-x-auto [contain:paint] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-busy={isFetching}
        >
          <table className="w-full min-w-[1000px] text-sm">
            <caption className="sr-only">
              Leads with contact details, local time, outcomes and call counts
            </caption>
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  <input
                    type="checkbox"
                    aria-label="Select all leads"
                    checked={allSelected}
                    disabled={isFetching}
                    onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                    className="h-4 w-4 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Business
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Owner
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Phone
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Location
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Local time
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Outcome
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Calls
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(isPending || isError || rows.length === 0) && (
                <tr>
                  <td colSpan={10} className="px-4 py-12">
                    <div
                      className="flex max-w-[min(24rem,calc(100vw-5rem))] flex-col items-start gap-3"
                      role={isError ? "alert" : undefined}
                    >
                      {isPending ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin motion-reduce:animate-none"
                          />{" "}
                          Loading your leads…
                        </p>
                      ) : isError ? (
                        <>
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <AlertCircle aria-hidden="true" className="h-4 w-4 text-destructive" />{" "}
                            Could not load leads
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Check your connection and try again. Your leads have not changed.
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => void refetch()}
                            disabled={isFetching}
                          >
                            {isFetching ? "Retrying…" : "Retry"}
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium">
                            {activeFilterCount
                              ? "No leads match these filters"
                              : "Your lead list starts here"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {activeFilterCount
                              ? "Try a broader search or clear the filters to see your contacts."
                              : "Import your business contacts to organize your calling list."}
                          </p>
                          <Button
                            variant="outline"
                            onClick={activeFilterCount ? clearFilters : () => setImportOpen(true)}
                          >
                            {activeFilterCount ? "Clear filters" : "Import CSV"}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {!isError &&
                !isPending &&
                rows.map((l) => {
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
                          disabled={isFetching}
                          checked={selected.includes(l.id)}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked ? [...s, l.id] : s.filter((id) => id !== l.id),
                            )
                          }
                          className="h-4 w-4 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                            aria-label={`Call ${l.business_name}`}
                            className="h-11 min-w-11 sm:h-8 sm:min-w-8"
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
                            <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Delete ${l.business_name}`}
                            onClick={() => setConfirmDelete([l.id])}
                            className="h-11 min-w-11 text-destructive hover:text-destructive sm:h-8 sm:min-w-8"
                          >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pb-16 text-xs text-muted-foreground">
        <span className="mono">
          {total === 0 ? 0 : page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-11 sm:h-9"
            disabled={page === 0 || isFetching}
            onClick={() => changePage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-11 sm:h-9"
            disabled={(page + 1) * PAGE >= total || isFetching}
            onClick={() => changePage(page + 1)}
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
