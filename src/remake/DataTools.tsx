import { useState } from "react";
import { Check, ChevronRight, Download, FileUp, RotateCcw, Upload } from "lucide-react";
import { Panel, PanelHead } from "./components";
import { isDirty, zones, type Action, type State } from "./model";
import {
  DATA_FILE_LIMIT,
  columnsFor,
  downloadText,
  guessMappings,
  historyCsv,
  leadsCsv,
  makeBackup,
  parseBackup,
  parseCsv,
  previewImport,
  readXlsx,
  type BackupEnvelope,
  type ImportMode,
  type ImportPreview,
  type ParsedSheet,
} from "./data-tools";
import "./data-tools.css";
import { useRuntime } from "./runtime";

type Props = { state: State; dispatch: (action: Action) => boolean | Promise<boolean> };
type Step = "upload" | "mapping" | "review" | "complete";
export function DataToolsPage({ state, dispatch }: Props) {
  const runtime = useRuntime();
  const [step, setStep] = useState<Step>("upload");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [name, setName] = useState("");
  const [paste, setPaste] = useState("");
  const [mappings, setMappings] = useState<string[]>([]);
  const [mode, setMode] = useState<ImportMode>("insert_only");
  const [defaultZone, setDefaultZone] = useState("America/New_York");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reviewVersion, setReviewVersion] = useState("");
  const [batchId, setBatchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [backup, setBackup] = useState<BackupEnvelope | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const dirty = isDirty(state),
    locked = Boolean(state.call?.active) || dirty || busy || Boolean(runtime.pending);
  const version = () => JSON.stringify([state.leads, state.customFields, state.suppressedNumbers]);
  const options = columnsFor(state.customFields);
  const batch = state.importBatches.find((item) => item.id === batchId);
  function reset() {
    setStep("upload");
    setSheet(null);
    setMappings([]);
    setPreview(null);
    setBatchId("");
    setError("");
    setName("");
  }
  function acceptSheet(parsed: ParsedSheet, filename: string) {
    setSheet(parsed);
    setMappings(guessMappings(parsed.headers, state.customFields));
    setName(filename);
    setStep("mapping");
    setError("");
    setMessage("");
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > DATA_FILE_LIMIT) throw new Error("Choose a file smaller than 5 MB.");
      if (/\.xlsx$/i.test(file.name))
        acceptSheet(await readXlsx(await file.arrayBuffer()), file.name);
      else if (/\.csv$/i.test(file.name)) acceptSheet(parseCsv(await file.text()), file.name);
      else
        throw new Error("Choose a CSV or XLSX file. Use the backup section for Call Board JSON.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  }
  function review() {
    if (!sheet) return;
    try {
      const result = previewImport(sheet, mappings, state, mode, defaultZone);
      setPreview(result);
      setReviewVersion(version());
      setStep("review");
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Review could not be prepared.");
    }
  }
  async function confirmImport() {
    if (!sheet || !preview || locked) return;
    if (version() !== reviewVersion) {
      review();
      setError(
        "Records or custom fields changed while reviewing. Check the updated preview, then confirm again.",
      );
      return;
    }
    const id = crypto.randomUUID();
    setBusy(true);
    const saved = await dispatch({
      type: "import",
      leads: preview.leads,
      mode,
      id,
      at: new Date().toISOString(),
      skipped: preview.skipped,
    });
    setBusy(false);
    if (!saved) {
      setError("The import was not saved. Review the workspace message and retry.");
      return;
    }
    setBatchId(id);
    setStep("complete");
    setError("");
  }
  function exportFile(kind: "leads" | "history" | "backup") {
    try {
      const date = new Date().toISOString().slice(0, 10);
      if (kind === "leads")
        downloadText(`callboard-leads-${date}.csv`, leadsCsv(state), "text/csv;charset=utf-8");
      if (kind === "history")
        downloadText(
          `callboard-call-history-${date}.csv`,
          historyCsv(state),
          "text/csv;charset=utf-8",
        );
      if (kind === "backup")
        downloadText(
          `callboard-backup-${date}.json`,
          JSON.stringify(makeBackup(state), null, 2),
          "application/json",
        );
      setMessage("Download prepared. Check your browser’s downloads.");
      setError("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The download could not be prepared.");
    }
  }
  async function readBackup(file: File | undefined) {
    if (!file) return;
    setBackup(null);
    setRestoreConfirmed(false);
    setError("");
    setBusy(true);
    try {
      if (file.size > DATA_FILE_LIMIT) throw new Error("Choose a backup smaller than 5 MB.");
      setBackup(parseBackup(await file.text()));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The backup could not be read.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="data-tools-page">
      {locked && (
        <p className="data-notice">
          {state.call?.active ? "End the current call" : "Save or discard your lead changes"} before
          importing or restoring records.
        </p>
      )}
      {error && (
        <p className="error data-notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="data-notice" role="status">
          {message}
        </p>
      )}
      <Panel>
        <PanelHead
          title="Import leads"
          subtitle="Preview every change before importing. No calls or invitations are started."
          action={
            step !== "upload" ? (
              <button className="text-button" onClick={reset}>
                <RotateCcw aria-hidden="true" size={15} />
                Start over
              </button>
            ) : undefined
          }
        />
        <ol className="data-steps" aria-label="Import progress">
          {["upload", "mapping", "review", "complete"].map((item, index) => (
            <li key={item} aria-current={step === item ? "step" : undefined}>
              <span>{index + 1}</span>
              {item}
              <ChevronRight aria-hidden="true" size={14} />
            </li>
          ))}
        </ol>
        <div className="data-panel-body">
          {step === "upload" && (
            <>
              <label className="data-upload">
                <FileUp aria-hidden="true" size={26} />
                <strong>{busy ? "Reading file…" : "Choose a CSV or XLSX file"}</strong>
                <span>First worksheet · header row required · 5 MB / 10,000 rows maximum</span>
                <input
                  type="file"
                  aria-label="Import lead file"
                  accept=".csv,.xlsx"
                  disabled={busy || locked}
                  onChange={(event) => {
                    void readFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className="field">
                <span>Or paste CSV with a header row</span>
                <textarea
                  value={paste}
                  onChange={(event) => setPaste(event.target.value)}
                  placeholder={"Business,Phone,Contact\nExample Studio,+12125550199,Jordan"}
                />
              </label>
              <button
                className="button"
                disabled={!paste.trim() || locked || busy}
                onClick={() => {
                  try {
                    acceptSheet(parseCsv(paste), "Pasted CSV");
                  } catch (problem) {
                    setError(problem instanceof Error ? problem.message : "Could not read CSV.");
                  }
                }}
              >
                <Upload aria-hidden="true" size={16} />
                Use pasted rows
              </button>
            </>
          )}
          {step === "mapping" && sheet && (
            <>
              <p className="data-subtitle">
                <strong>{name}</strong> · {sheet.rows.length} rows. Map Business name and Main
                phone. Phone 2 is not assumed to be a contact’s direct number.
              </p>
              <div className="data-mapping">
                <div className="data-mapping-head">
                  <strong>Source column</strong>
                  <strong>Call Board field</strong>
                </div>
                {sheet.headers.map((header, index) => (
                  <div key={index}>
                    <span>
                      {header}
                      <small>{sheet.rows[0]?.[index] || "Empty sample"}</small>
                    </span>
                    <select
                      aria-label={`Map column ${index + 1}: ${header}`}
                      value={mappings[index]}
                      onChange={(event) =>
                        setMappings((current) =>
                          current.map((value, i) => (i === index ? event.target.value : value)),
                        )
                      }
                    >
                      <option value="skip">Skip column</option>
                      {options.map((field) => (
                        <option
                          key={field.key}
                          value={field.key}
                          disabled={mappings.some((value, i) => i !== index && value === field.key)}
                        >
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Default timezone for rows without one</span>
                  <select
                    value={defaultZone}
                    onChange={(event) => setDefaultZone(event.target.value)}
                  >
                    {zones.map((zone) => (
                      <option key={zone.value} value={zone.value}>
                        {zone.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Import mode</span>
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as ImportMode)}
                  >
                    <option value="insert_only">Add new only</option>
                    <option value="fill_blanks">Add new and fill blank fields</option>
                  </select>
                </label>
              </div>
              <p className="hint">
                10-digit US numbers use +1. Use +country code for other countries. Timezones must be
                IANA names, such as America/New_York. Existing notes, outcomes and nonblank values
                are preserved.
              </p>
              <div className="data-actions">
                <button className="button" onClick={reset}>
                  Back
                </button>
                <button className="button primary" disabled={locked} onClick={review}>
                  Review import
                  <ChevronRight aria-hidden="true" size={16} />
                </button>
              </div>
            </>
          )}
          {step === "review" && preview && (
            <>
              <div className="data-counts">
                <span>
                  <strong>{preview.added}</strong>new leads
                </span>
                <span>
                  <strong>{preview.updated}</strong>existing leads to fill
                </span>
                <span>
                  <strong>{preview.skipped}</strong>skipped rows
                </span>
              </div>
              <p className="hint">
                This is a dry run. Nothing has been imported.{" "}
                {mode === "fill_blanks"
                  ? "Only blank existing fields will be filled."
                  : "Existing numbers are skipped."}{" "}
                Suppressed numbers stay blocked.
              </p>
              {preview.leads.length > 0 && (
                <div
                  className="data-issues"
                  role="region"
                  aria-label="Prepared import rows"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Number</th>
                        <th>Contact email</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.leads.slice(0, 20).map((lead) => (
                        <tr key={lead.id}>
                          <td>{lead.business}</td>
                          <td className="mono">{lead.phone}</td>
                          <td>{lead.email || "—"}</td>
                          <td>
                            {state.leads.some((existing) => existing.id === lead.id)
                              ? "Fill blank fields"
                              : "Add new lead"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.leads.length > 20 && (
                    <p className="hint">First 20 of {preview.leads.length} prepared rows.</p>
                  )}
                </div>
              )}
              {preview.issues.length > 0 && (
                <div
                  className="data-issues"
                  role="region"
                  aria-label="Import row issues"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>CSV/worksheet row</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.issues.map((issue) => (
                        <tr key={issue.row}>
                          <td>{issue.row}</td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="data-actions">
                <button className="button" onClick={() => setStep("mapping")}>
                  Back to mapping
                </button>
                <button
                  className="button primary"
                  disabled={locked || !preview.leads.length}
                  onClick={confirmImport}
                >
                  <Check aria-hidden="true" size={16} />
                  Confirm import of {preview.leads.length} rows
                </button>
              </div>
              {!preview.leads.length && (
                <p className="hint">
                  No changes to import. Fix the file or choose a different merge mode.
                </p>
              )}
            </>
          )}
          {step === "complete" && (
            <>
              {batch ? (
                <>
                  <div className="data-counts">
                    <span>
                      <strong>{batch.added}</strong>added
                    </span>
                    <span>
                      <strong>{batch.updated}</strong>updated
                    </span>
                    <span>
                      <strong>{batch.skipped}</strong>skipped
                    </span>
                  </div>
                  <p role="status">
                    Import batch recorded. Your lead list is ready; no call was started.
                  </p>
                </>
              ) : (
                <p role="status">
                  The import was submitted. The batch result will appear when records are saved.
                </p>
              )}
              <button className="button" onClick={reset}>
                Import another file
              </button>
            </>
          )}
        </div>
      </Panel>
      <Panel>
        <PanelHead
          title="Export your records"
          subtitle="CSV files protect spreadsheet formula cells. JSON preserves the full data structure."
        />
        <div className="data-panel-body data-export">
          <button className="button" onClick={() => exportFile("leads")}>
            <Download aria-hidden="true" size={16} />
            Leads CSV
          </button>
          <button className="button" onClick={() => exportFile("history")}>
            <Download aria-hidden="true" size={16} />
            Call history CSV
          </button>
          <button
            className="button"
            disabled={Boolean(state.call?.active)}
            onClick={() => exportFile("backup")}
          >
            <Download aria-hidden="true" size={16} />
            Full JSON backup
          </button>
          <p className="hint">
            Backups contain CRM records and preferences, never provider credentials, authentication
            tokens, active calls or browser sessions. A running session is paused in the backup.
          </p>
        </div>
      </Panel>
      <Panel>
        <PanelHead
          title="Restore a Call Board backup"
          subtitle="Only versioned Call Board JSON is accepted. Review the contents before replacing current records."
        />
        <div className="data-panel-body">
          <label className="field">
            <span>Backup JSON file</span>
            <input
              type="file"
              aria-label="Restore backup file"
              accept=".json,application/json"
              disabled={busy || locked}
              onChange={(event) => {
                void readBackup(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {backup && (
            <div className="data-restore">
              <p>
                Backup from {new Date(backup.exportedAt).toLocaleString()} ·{" "}
                <strong>{backup.data.leads.length} leads</strong>, {backup.data.logs.length} calls,{" "}
                {backup.data.bookings.length} bookings, {backup.data.sessions.length} sessions.
              </p>
              <p className="hint">
                Existing permanent do-not-call numbers remain suppressed. Restoring does not place
                calls or resume sessions.
              </p>
              <label className="data-check">
                <input
                  type="checkbox"
                  checked={restoreConfirmed}
                  onChange={(event) => setRestoreConfirmed(event.target.checked)}
                />
                I understand this replaces current records and saved configuration.
              </label>
              <button
                className="button danger"
                disabled={!restoreConfirmed || locked || runtime.mode === "live"}
                onClick={async () => {
                  setBusy(true);
                  const saved = await dispatch({ type: "restoreData", data: backup.data });
                  setBusy(false);
                  if (!saved) {
                    setError("The backup was not restored. Your previous records are unchanged.");
                    return;
                  }
                  setBackup(null);
                  setRestoreConfirmed(false);
                  setMessage("Backup restore submitted. No session or call was started.");
                }}
              >
                {runtime.mode === "live"
                  ? "Restore backups in the offline copy first"
                  : "Replace records from this backup"}
              </button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
