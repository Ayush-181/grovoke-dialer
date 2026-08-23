import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_FIELDS, autoMap, looksLikeHeader, parseCsvText } from "@/lib/csv";
import type { LeadField } from "@/lib/csv";
import { normalizePhone, toE164 } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImported: () => void;
};

type Row = Record<string, string | null>;
type RowError = { row: number; reason: string };
type Summary = {
  inserted: number;
  existing: number;
  failed: number;
  errors: RowError[];
};

const CHUNK = 200;

export function ImportDialog({ open, onOpenChange, workspaceId, onImported }: Props) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<LeadField, number>>(
    {} as Record<LeadField, number>,
  );
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping({} as Record<LeadField, number>);
    setSummary(null);
  };

  const onFile = async (file: File) => {
    const grid = parseCsvText(await file.text());
    if (grid.length === 0) {
      toast.error("That file looks empty");
      return;
    }
    const first = grid[0]!;
    const hasHeader = looksLikeHeader(first);
    const hdrs = hasHeader ? first : first.map((_, i) => `Column ${i + 1}`);
    setSummary(null);
    setHeaders(hdrs);
    setRows(hasHeader ? grid.slice(1) : grid);
    setMapping(autoMap(hdrs));
  };

  /** Build insertable rows; every skipped row is reported with a line number. */
  const buildRows = () => {
    const out: { row: Row; line: number }[] = [];
    const errors: RowError[] = [];
    const seen = new Map<string, number>();
    const headerOffset = 2; // 1-based + header line

    rows.forEach((r, i) => {
      const line = i + headerOffset;
      const at = (f: LeadField) => {
        const idx = mapping[f];
        return idx != null && idx >= 0 ? (r[idx] ?? "").trim() : "";
      };
      const rawPhone = at("phone");
      const normalized = normalizePhone(rawPhone);
      if (!rawPhone) {
        errors.push({ row: line, reason: "missing phone" });
        return;
      }
      if (normalized.length < 10) {
        errors.push({ row: line, reason: `invalid phone "${rawPhone}"` });
        return;
      }
      const dupOf = seen.get(normalized);
      if (dupOf) {
        errors.push({ row: line, reason: `duplicate phone in file (also row ${dupOf})` });
        return;
      }
      seen.set(normalized, line);
      const val = (f: LeadField) => at(f) || null;
      out.push({
        line,
        row: {
          workspace_id: workspaceId,
          business_name: val("business_name") ?? "Unknown business",
          phone: toE164(rawPhone),
          phone_normalized: normalized,
          address: val("address"),
          city: val("city"),
          state: val("state"),
          zip: val("zip"),
          website: val("website"),
          email: val("email"),
          notes: val("notes"),
        },
      });
    });
    return { out, errors };
  };

  const runImport = async () => {
    setBusy(true);
    setSummary(null);
    try {
      const { out, errors } = buildRows();
      if (out.length === 0) {
        setSummary({ inserted: 0, existing: 0, failed: errors.length, errors });
        toast.error("No rows with a usable phone number");
        return;
      }

      let inserted = 0;
      let attempted = 0;

      for (let i = 0; i < out.length; i += CHUNK) {
        const slice = out.slice(i, i + CHUNK);
        const payload = slice.map((s) => s.row);
        const { data, error } = await supabase
          .from("leads")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(payload as any, {
            onConflict: "workspace_id,phone_normalized",
            ignoreDuplicates: true,
          })
          .select("id");

        if (!error) {
          inserted += data?.length ?? 0;
          attempted += slice.length;
          continue;
        }

        // Chunk failed — retry row by row so one bad row can't kill the batch.
        for (const item of slice) {
          const { data: one, error: rowErr } = await supabase
            .from("leads")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert([item.row] as any, {
              onConflict: "workspace_id,phone_normalized",
              ignoreDuplicates: true,
            })
            .select("id");
          if (rowErr) {
            errors.push({ row: item.line, reason: rowErr.message });
          } else {
            attempted += 1;
            inserted += one?.length ?? 0;
          }
        }
      }

      const existing = Math.max(0, attempted - inserted);
      setSummary({ inserted, existing, failed: errors.length, errors });
      if (inserted > 0) {
        toast.success(`Imported ${inserted} new leads · ${errors.length} rows skipped`);
      } else {
        toast.warning(`No new leads imported · ${errors.length} rows skipped`);
      }
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const preview = rows.slice(0, 5);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>
            Rows are de-duplicated by phone number, both inside the file and against existing
            leads.
          </DialogDescription>
        </DialogHeader>

        {headers.length === 0 ? (
          <label className="flex h-40 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            Drop in a CSV — click to choose a file
          </label>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {LEAD_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {f.label}
                    {"required" in f && f.required && <span className="text-primary"> *</span>}
                  </label>
                  <select
                    value={mapping[f.key] ?? -1}
                    onChange={(e) =>
                      setMapping({ ...mapping, [f.key]: Number(e.target.value) })
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                  >
                    <option value={-1}>— ignore —</option>
                    {headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h} (col {i + 1})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="max-h-56 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-raised">
                  <tr>
                    {headers.map((h, i) => (
                      <th
                        key={`${h}-${i}`}
                        className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      {headers.map((_, c) => (
                        <td key={c} className="mono max-w-[160px] truncate px-2 py-1">
                          {r[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {summary && (
              <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <div className="mono flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="text-success">{summary.inserted} imported</span>
                  <span className="text-muted-foreground">
                    {summary.existing} already existed
                  </span>
                  <span className={summary.failed ? "text-destructive" : "text-muted-foreground"}>
                    {summary.failed} skipped
                  </span>
                </div>
                {summary.errors.length > 0 && (
                  <div className="max-h-32 overflow-auto rounded-md border border-border bg-background p-2">
                    <ul className="mono space-y-0.5 text-[11px] text-muted-foreground">
                      {summary.errors.slice(0, 100).map((e, i) => (
                        <li key={i}>
                          Row {e.row}: {e.reason}
                        </li>
                      ))}
                      {summary.errors.length > 100 && (
                        <li>…and {summary.errors.length - 100} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="mono text-xs text-muted-foreground">
                {rows.length} rows detected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Choose another file
                </Button>
                {summary ? (
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => void runImport()}>
                    {busy ? "Importing…" : `Import ${rows.length} rows`}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
