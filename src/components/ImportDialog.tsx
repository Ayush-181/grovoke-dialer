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

type Row = Record<string, string>;

export function ImportDialog({ open, onOpenChange, workspaceId, onImported }: Props) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<LeadField, string>>(
    {} as Record<LeadField, string>,
  );
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping({} as Record<LeadField, string>);
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
    setHeaders(hdrs);
    setRows(hasHeader ? grid.slice(1) : grid);
    setMapping(autoMap(hdrs));
  };

  const buildRows = () => {
    const idx = (field: LeadField) => headers.indexOf(mapping[field] ?? "");
    const out: Row[] = [];
    const seen = new Set<string>();
    let skippedNoPhone = 0;
    let dupInFile = 0;

    for (const r of rows) {
      const rawPhone = idx("phone") >= 0 ? (r[idx("phone")] ?? "") : "";
      const normalized = normalizePhone(rawPhone);
      if (normalized.length < 10) {
        skippedNoPhone++;
        continue;
      }
      if (seen.has(normalized)) {
        dupInFile++;
        continue;
      }
      seen.add(normalized);
      const get = (f: LeadField) => (idx(f) >= 0 ? (r[idx(f)] ?? "").trim() || null : null);
      out.push({
        workspace_id: workspaceId,
        business_name: get("business_name") ?? "Unknown business",
        phone: toE164(rawPhone),
        phone_normalized: normalized,
        address: get("address"),
        city: get("city"),
        state: get("state"),
        zip: get("zip"),
        website: get("website"),
        email: get("email"),
        notes: get("notes"),
      } as unknown as Row);
    }
    return { out, skippedNoPhone, dupInFile };
  };

  const runImport = async () => {
    setBusy(true);
    try {
      const { out, skippedNoPhone, dupInFile } = buildRows();
      if (out.length === 0) {
        toast.error("No rows with a usable phone number");
        return;
      }
      let inserted = 0;
      for (let i = 0; i < out.length; i += 500) {
        const chunk = out.slice(i, i + 500);
        const { data, error } = await supabase
          .from("leads")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(chunk as any, {
            onConflict: "workspace_id,phone_normalized",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error) throw error;
        inserted += data?.length ?? 0;
      }
      toast.success(
        `Imported ${inserted} new leads · ${out.length - inserted} already existed · ${dupInFile} duplicates in file · ${skippedNoPhone} without a phone`,
      );
      onImported();
      reset();
      onOpenChange(false);
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
          <label className="flex h-40 cursor-pointer items-center justify-center rounded border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
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
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                  >
                    <option value="">— ignore —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="max-h-56 overflow-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-raised">
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h}
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

            <div className="flex items-center justify-between">
              <span className="mono text-xs text-muted-foreground">
                {rows.length} rows detected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Choose another file
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void runImport()}>
                  {busy ? "Importing…" : `Import ${rows.length} rows`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
