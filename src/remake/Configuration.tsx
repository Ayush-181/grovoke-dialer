import { useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Columns3,
  Copy,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { Empty, Field, Modal, Panel, PanelHead } from "./components";
import type { Action, State } from "./model";
import type { CustomField, PipelineStage, ScriptTemplate } from "./domain";
import { OUTCOMES, outcomeLabel } from "../lib/outcomes";
import { renderScript, renameCustomFieldTokens, SCRIPT_TOKENS } from "./template-values";
import { useRuntime } from "./runtime";
import "./configuration.css";

type Section = "templates" | "pipeline" | "fields";
type Props = {
  state: State;
  dispatch: (action: Action) => boolean | Promise<boolean>;
  section?: Section;
};
type Editor =
  | { kind: "template"; value: ScriptTemplate }
  | { kind: "stage"; value: PipelineStage }
  | { kind: "field"; value: CustomField; optionsText: string };
const templateKinds = [
  ["opener", "Opener"],
  ["gatekeeper", "Gatekeeper"],
  ["voicemail", "Voicemail"],
] as const;
const fieldTypes = [
  ["text", "Text"],
  ["number", "Number"],
  ["date", "Date"],
  ["select", "Dropdown"],
  ["checkbox", "Yes / no"],
  ["url", "Link"],
] as const;
const sections = [
  { id: "templates", label: "Scripts", icon: BookOpen },
  { id: "pipeline", label: "Pipeline", icon: Columns3 },
  { id: "fields", label: "Custom fields", icon: Settings2 },
] as const;
const normalLabel = (label: string) => label.trim().toLocaleLowerCase();

export function ConfigurationPage({ state, dispatch, section = "templates" }: Props) {
  const runtime = useRuntime();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const busy = saving || Boolean(runtime.pending);
  const [active, setActive] = useState<Section>(section);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [previewLeadId, setPreviewLeadId] = useState(state.selectedId);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState<{
    kind: "template" | "stage" | "field";
    id: string;
    name: string;
  } | null>(null);
  const templates = state.templates ?? [];
  const stages = state.stages ?? [];
  const fields = state.customFields ?? [];
  const selected = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const previewLead = state.leads.find((lead) => lead.id === previewLeadId) ?? state.leads[0];
  const preview = renderScript(
    editor?.kind === "template" ? editor.value.body : (selected?.body ?? ""),
    previewLead,
    state.preferences,
    fields,
  );
  const setView = (value: Section) => {
    if (busy) return;
    setActive(value);
    setError("");
    setStatus("");
  };
  const edit = (value: Editor) => {
    if (busy) return;
    setError("");
    setStatus("");
    setEditor(value);
  };
  const fail = (message: string) => {
    setError(message);
  };
  const inUse = (id: string) => state.leads.filter((lead) => lead.stageId === id).length;
  const fieldInUse = (id: string) =>
    state.leads.some((lead) => {
      const value = lead.customValues?.[id];
      return value !== undefined && value !== null && value !== "";
    });
  async function persist(
    patch: Partial<Pick<State, "templates" | "stages" | "customFields">>,
  ): Promise<boolean> {
    if (savingRef.current || runtime.pending) return false;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const acknowledged = await dispatch({ type: "configuration", patch });
      if (acknowledged !== true) {
        setError(
          "These changes could not be saved. Your edits are still here; try again after the connection recovers.",
        );
        return false;
      }
      return true;
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "These changes could not be saved. Your edits are still here.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!editor || busy || savingRef.current) return;
    if (editor.kind === "template") {
      const item = {
        ...editor.value,
        name: editor.value.name.trim(),
        body: editor.value.body.trim(),
      };
      if (!item.name || !item.body) return fail("Enter a script name and body.");
      if (
        templates.some(
          (other) => other.id !== item.id && normalLabel(other.name) === normalLabel(item.name),
        )
      )
        return fail("A script with this name already exists.");
      if (
        !(await persist({
          templates: templates.some((other) => other.id === item.id)
            ? templates.map((other) => (other.id === item.id ? item : other))
            : [...templates, item],
        }))
      )
        return;
      setSelectedTemplateId(item.id);
    } else if (editor.kind === "stage") {
      const item = { ...editor.value, label: editor.value.label.trim() };
      if (!item.label) return fail("Enter a stage name.");
      if (
        stages.some(
          (other) => other.id !== item.id && normalLabel(other.label) === normalLabel(item.label),
        )
      )
        return fail("A stage with this name already exists.");
      const duplicate = stages.find(
        (other) =>
          other.id !== item.id && other.outcomes.some((outcome) => item.outcomes.includes(outcome)),
      );
      if (duplicate)
        return fail(
          `An outcome is already assigned to ${duplicate.label}. Remove its existing assignment first.`,
        );
      if (item.terminal && stages[0]?.id === item.id)
        return fail(
          "The starting stage must remain open. Reorder the pipeline before making this stage terminal.",
        );
      if (
        !(await persist({
          stages: stages.some((other) => other.id === item.id)
            ? stages.map((other) => (other.id === item.id ? item : other))
            : [...stages, item],
        }))
      )
        return;
    } else {
      const options = editor.optionsText
        .split(/\n|,/)
        .map((value) => value.trim())
        .filter(Boolean);
      const item = {
        ...editor.value,
        label: editor.value.label.trim(),
        options: editor.value.type === "select" ? options : [],
      };
      if (!item.label) return fail("Enter a field label.");
      if (/[{}]/.test(item.label))
        return fail(
          "Use a field label without curly braces; braces are reserved for script fields.",
        );
      if (
        fields.some(
          (other) => other.id !== item.id && normalLabel(other.label) === normalLabel(item.label),
        )
      )
        return fail("A field with this label already exists.");
      if (
        item.type === "select" &&
        (!options.length || new Set(options.map(normalLabel)).size !== options.length)
      )
        return fail("Add at least one dropdown option and remove duplicate options.");
      const prior = fields.find((other) => other.id === item.id);
      if (prior && prior.type !== item.type && fieldInUse(item.id))
        return fail(
          "This field contains values. Keep its type, or clear those values before changing it.",
        );
      if (
        item.type === "select" &&
        state.leads.some((lead) => {
          const value = lead.customValues?.[item.id];
          return (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            !options.includes(String(value))
          );
        })
      )
        return fail(
          "A removed option is still used by a lead. Update those values before removing the option.",
        );
      if (
        !(await persist({
          customFields: prior
            ? fields.map((other) => (other.id === item.id ? item : other))
            : [...fields, item],
          ...(prior && prior.label !== item.label
            ? {
                templates: templates.map((template) => ({
                  ...template,
                  body: renameCustomFieldTokens(template.body, prior.label, item.label),
                })),
              }
            : {}),
        }))
      )
        return;
    }
    setEditor(null);
    setError("");
    setStatus("Changes saved.");
  }
  async function moveStage(index: number, direction: -1 | 1) {
    if (busy || savingRef.current) return;
    const next = stages.slice();
    const destination = index + direction;
    if (!next[destination]) return;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    if (next[0]?.terminal) {
      setError("Choose an open stage as the starting stage.");
      return;
    }
    if (!(await persist({ stages: next }))) return;
    setStatus("Stage order saved.");
    setError("");
  }
  async function remove() {
    if (!deleting || busy || savingRef.current) return;
    if (deleting.kind === "stage") {
      if (stages.length <= 1 || inUse(deleting.id)) {
        setError("Keep at least one stage, and move assigned leads before deleting a stage.");
        setDeleting(null);
        return;
      }
      const next = stages.filter((item) => item.id !== deleting.id);
      if (next[0]?.terminal) {
        setError("The pipeline needs an open starting stage.");
        setDeleting(null);
        return;
      }
      if (!(await persist({ stages: next }))) return;
    } else if (deleting.kind === "field") {
      if (fieldInUse(deleting.id)) {
        setError("Clear this field’s lead values before deleting it.");
        setDeleting(null);
        return;
      }
      if (!(await persist({ customFields: fields.filter((item) => item.id !== deleting.id) })))
        return;
    } else if (!(await persist({ templates: templates.filter((item) => item.id !== deleting.id) })))
      return;
    setDeleting(null);
    setStatus("Removed.");
    setError("");
  }
  return (
    <div
      className="configuration-page"
      aria-busy={busy}
      onClickCapture={(event) => {
        if (busy) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="configuration-tabs" role="group" aria-label="Workspace configuration">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`button ${active === id ? "selected" : ""}`}
            aria-pressed={active === id}
            onClick={() => setView(id)}
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </button>
        ))}
      </div>
      {status && (
        <p className="configuration-status" role="status">
          <Check aria-hidden="true" size={16} />
          {status}
        </p>
      )}
      {!editor && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {active === "templates" && (
        <Panel>
          <PanelHead
            title="Call scripts"
            subtitle="Reusable words for the conversation. Editing a script never places a call."
            action={
              <button
                className="button primary"
                onClick={() =>
                  edit({
                    kind: "template",
                    value: { id: crypto.randomUUID(), name: "", kind: "opener", body: "" },
                  })
                }
              >
                <Plus aria-hidden="true" size={16} />
                New script
              </button>
            }
          />
          <div className="configuration-script-grid">
            <div className="configuration-script-list" aria-label="Saved call scripts">
              {templates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelectedTemplateId(item.id)}
                >
                  <strong>{item.name}</strong>
                  <small>{templateKinds.find(([kind]) => kind === item.kind)?.[1]}</small>
                </button>
              ))}
              {!templates.length && (
                <Empty
                  title="No scripts yet"
                  description="Create an opener, a gatekeeper script or a voicemail message."
                />
              )}
            </div>
            <div className="configuration-script-preview">
              {selected ? (
                <>
                  <div className="configuration-title-actions">
                    <div>
                      <h3>{selected.name}</h3>
                      <span className="badge neutral">
                        {templateKinds.find(([kind]) => kind === selected.kind)?.[1]}
                      </span>
                    </div>
                    <div>
                      <button
                        className="button"
                        onClick={() => edit({ kind: "template", value: { ...selected } })}
                      >
                        <Pencil aria-hidden="true" size={15} />
                        Edit script
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Duplicate ${selected.name}`}
                        onClick={() =>
                          edit({
                            kind: "template",
                            value: {
                              ...selected,
                              id: crypto.randomUUID(),
                              name: `${selected.name} copy`,
                            },
                          })
                        }
                      >
                        <Copy aria-hidden="true" size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete ${selected.name}`}
                        onClick={() =>
                          setDeleting({ kind: "template", id: selected.id, name: selected.name })
                        }
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </div>
                  </div>
                  <label className="field">
                    <span>Preview for business</span>
                    <select
                      aria-label="Script preview business"
                      value={previewLead?.id ?? ""}
                      onChange={(event) => setPreviewLeadId(event.target.value)}
                    >
                      {state.leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.business}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="configuration-rendered" aria-label="Script preview">
                    {preview.text}
                  </div>
                  {preview.missing.length > 0 && (
                    <p className="configuration-missing">
                      Fill in: {preview.missing.join(", ")}. Unfilled words stay visible so you can
                      correct them before a call.
                    </p>
                  )}
                </>
              ) : (
                <p className="hint">
                  Select or create a script to preview it with your lead details.
                </p>
              )}
            </div>
          </div>
        </Panel>
      )}
      {active === "pipeline" && (
        <Panel>
          <PanelHead
            title="Pipeline stages"
            subtitle="Keep business progress separate from individual call outcomes. The first stage is the starting stage."
            action={
              <button
                className="button primary"
                onClick={() =>
                  edit({
                    kind: "stage",
                    value: {
                      id: crypto.randomUUID(),
                      label: "",
                      terminal: false,
                      noFollowUps: false,
                      outcomes: [],
                    },
                  })
                }
              >
                <Plus aria-hidden="true" size={16} />
                New stage
              </button>
            }
          />
          <div className="configuration-rows">
            {stages.map((item, index) => (
              <div className="configuration-row" key={item.id}>
                <div className="configuration-row-copy">
                  <h3>{item.label}</h3>
                  <div className="configuration-badges">
                    {index === 0 && <span className="badge good">Starts here</span>}
                    {item.terminal && <span className="badge neutral">Terminal</span>}
                    {item.noFollowUps && <span className="badge neutral">No follow-ups</span>}
                    <span className="hint">{inUse(item.id)} assigned leads</span>
                  </div>
                  <p>
                    {item.outcomes.length
                      ? `Set by: ${item.outcomes.map(outcomeLabel).join(", ")}`
                      : "Manual stage assignment"}
                  </p>
                </div>
                <div className="configuration-row-actions">
                  <button
                    className="icon-button"
                    aria-label={`Move ${item.label} up`}
                    disabled={index === 0}
                    onClick={() => moveStage(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Move ${item.label} down`}
                    disabled={index === stages.length - 1}
                    onClick={() => moveStage(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${item.label} stage`}
                    onClick={() =>
                      edit({ kind: "stage", value: { ...item, outcomes: [...item.outcomes] } })
                    }
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${item.label} stage`}
                    disabled={stages.length <= 1 || inUse(item.id) > 0}
                    title={
                      inUse(item.id) ? "Move assigned leads before deleting this stage" : undefined
                    }
                    onClick={() => setDeleting({ kind: "stage", id: item.id, name: item.label })}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {active === "fields" && (
        <Panel>
          <PanelHead
            title="Custom fields"
            subtitle="The same typed fields are available on lead details, in imports and in exports."
            action={
              <button
                className="button primary"
                onClick={() =>
                  edit({
                    kind: "field",
                    value: {
                      id: crypto.randomUUID(),
                      label: "",
                      type: "text",
                      options: [],
                      showInTable: false,
                    },
                    optionsText: "",
                  })
                }
              >
                <Plus aria-hidden="true" size={16} />
                Add field
              </button>
            }
          />
          <div className="configuration-rows">
            {fields.map((item) => (
              <div className="configuration-row" key={item.id}>
                <div className="configuration-row-copy">
                  <h3>{item.label}</h3>
                  <div className="configuration-badges">
                    <span className="badge neutral">
                      {fieldTypes.find(([type]) => type === item.type)?.[1]}
                    </span>
                    {item.showInTable && <span className="badge neutral">Shown in lead table</span>}
                  </div>
                  {item.type === "select" && <p>{item.options.join(" · ")}</p>}
                  {fieldInUse(item.id) && (
                    <p className="hint">
                      Contains lead values. Clear them before deleting this field or changing its
                      type.
                    </p>
                  )}
                </div>
                <div className="configuration-row-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${item.label} field`}
                    onClick={() =>
                      edit({
                        kind: "field",
                        value: { ...item, options: [...item.options] },
                        optionsText: item.options.join("\n"),
                      })
                    }
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${item.label} field`}
                    disabled={fieldInUse(item.id)}
                    onClick={() => setDeleting({ kind: "field", id: item.id, name: item.label })}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!fields.length && (
            <Empty
              title="Keep useful research close"
              description="Add fields such as Budget, Current provider or Website quality. Your leads keep their existing details."
            />
          )}
        </Panel>
      )}
      <Modal
        open={Boolean(editor)}
        onClose={() => {
          if (busy) return;
          setEditor(null);
          setError("");
        }}
        title={
          editor?.kind === "template"
            ? "Edit call script"
            : editor?.kind === "stage"
              ? "Edit pipeline stage"
              : "Edit custom field"
        }
        description="Save applies your workspace configuration. Cancel keeps the existing version."
      >
        {editor && (
          <form className="configuration-editor" onSubmit={save}>
            <fieldset className="configuration-form-fields" disabled={busy}>
              {editor.kind === "template" ? (
                <>
                  <Field
                    label="Script name"
                    maxLength={80}
                    required
                    value={editor.value.name}
                    onChange={(event) =>
                      setEditor({ ...editor, value: { ...editor.value, name: event.target.value } })
                    }
                  />
                  <label className="field">
                    <span>Script kind</span>
                    <select
                      value={editor.value.kind}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: {
                            ...editor.value,
                            kind: event.target.value as ScriptTemplate["kind"],
                          },
                        })
                      }
                    >
                      {templateKinds.map(([kind, label]) => (
                        <option key={kind} value={kind}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Script body</span>
                    <textarea
                      id="script-body-editor"
                      required
                      maxLength={10000}
                      rows={7}
                      value={editor.value.body}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: { ...editor.value, body: event.target.value },
                        })
                      }
                    />
                  </label>
                  <div className="configuration-token-buttons" aria-label="Insert script field">
                    {[...SCRIPT_TOKENS, ...fields.map((field) => `Custom:${field.label}`)].map(
                      (token) => (
                        <button
                          key={token}
                          type="button"
                          className="button"
                          onClick={() => {
                            const textarea = document.getElementById(
                              "script-body-editor",
                            ) as HTMLTextAreaElement | null;
                            const start = textarea?.selectionStart ?? editor.value.body.length;
                            const end = textarea?.selectionEnd ?? start;
                            const body = `${editor.value.body.slice(0, start)}{${token}}${editor.value.body.slice(end)}`;
                            setEditor({ ...editor, value: { ...editor.value, body } });
                            requestAnimationFrame(() => {
                              textarea?.focus();
                              textarea?.setSelectionRange(
                                start + token.length + 2,
                                start + token.length + 2,
                              );
                            });
                          }}
                        >{`{${token}}`}</button>
                      ),
                    )}
                  </div>
                  <div className="configuration-rendered" aria-label="Edited script preview">
                    {preview.text || "Your preview will appear here."}
                  </div>
                  {preview.missing.length > 0 && (
                    <p className="configuration-missing">
                      Unfilled words: {preview.missing.join(", ")}. They will remain visible in the
                      script.
                    </p>
                  )}
                </>
              ) : editor.kind === "stage" ? (
                <>
                  <Field
                    label="Stage name"
                    maxLength={80}
                    required
                    value={editor.value.label}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        value: { ...editor.value, label: event.target.value },
                      })
                    }
                  />
                  <label className="configuration-check">
                    <input
                      type="checkbox"
                      checked={editor.value.terminal}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: { ...editor.value, terminal: event.target.checked },
                        })
                      }
                    />
                    <span>Terminal stage · business is no longer in the active pipeline</span>
                  </label>
                  <label className="configuration-check">
                    <input
                      type="checkbox"
                      checked={editor.value.noFollowUps}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: { ...editor.value, noFollowUps: event.target.checked },
                        })
                      }
                    />
                    <span>No follow-ups · prevent scheduling new callbacks in this stage</span>
                  </label>
                  <fieldset>
                    <legend>Move here after these outcomes</legend>
                    <p className="hint">
                      One stage per outcome. Unassign an outcome from its current stage before
                      moving it.
                    </p>
                    <div className="configuration-outcome-options">
                      {OUTCOMES.map((outcome) => {
                        const assigned = stages.find(
                          (stage) =>
                            stage.id !== editor.value.id && stage.outcomes.includes(outcome.value),
                        );
                        return (
                          <label className="configuration-check" key={outcome.value}>
                            <input
                              type="checkbox"
                              checked={editor.value.outcomes.includes(outcome.value)}
                              disabled={Boolean(assigned)}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  value: {
                                    ...editor.value,
                                    outcomes: event.target.checked
                                      ? [...editor.value.outcomes, outcome.value]
                                      : editor.value.outcomes.filter(
                                          (value) => value !== outcome.value,
                                        ),
                                  },
                                })
                              }
                            />
                            <span>
                              {outcome.label}
                              {assigned && <small>Currently {assigned.label}</small>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </>
              ) : (
                <>
                  <Field
                    label="Field label"
                    maxLength={80}
                    required
                    value={editor.value.label}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        value: { ...editor.value, label: event.target.value },
                      })
                    }
                  />
                  <label className="field">
                    <span>Field type</span>
                    <select
                      value={editor.value.type}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: {
                            ...editor.value,
                            type: event.target.value as CustomField["type"],
                          },
                        })
                      }
                    >
                      {fieldTypes.map(([type, label]) => (
                        <option key={type} value={type}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {editor.value.type === "select" && (
                    <label className="field">
                      <span>Dropdown options · one per line</span>
                      <textarea
                        rows={5}
                        value={editor.optionsText}
                        onChange={(event) =>
                          setEditor({ ...editor, optionsText: event.target.value })
                        }
                        required
                      />
                    </label>
                  )}
                  <label className="configuration-check">
                    <input
                      type="checkbox"
                      checked={editor.value.showInTable}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          value: { ...editor.value, showInTable: event.target.checked },
                        })
                      }
                    />
                    <span>Show as a column in the lead table</span>
                  </label>
                  <p className="hint">
                    Existing values are preserved. Fields with values cannot be deleted or changed
                    to another type.
                  </p>
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setEditor(null);
                    setError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="button primary">
                  {busy ? "Saving…" : "Save"}{" "}
                  {editor.kind === "template"
                    ? "script"
                    : editor.kind === "stage"
                      ? "stage"
                      : "field"}
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </Modal>
      <Modal
        open={Boolean(deleting)}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? "item"}?`}
        description="This removes the configuration item. No call is placed and no external message is sent."
      >
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button" disabled={busy} onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button className="button danger" disabled={busy} onClick={remove}>
            {busy ? "Removing…" : "Delete"}{" "}
            {deleting?.kind === "template" ? "script" : deleting?.kind}
          </button>
        </div>
      </Modal>
    </div>
  );
}
