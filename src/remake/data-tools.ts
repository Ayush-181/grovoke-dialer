import { z } from "zod";
import type { DataSnapshot, Lead, State } from "./model";
import { dialNumber } from "./numbers";
import {
  isValidZone,
  leadPhones,
  validateCustomValues,
  type CustomField,
  type CustomValue,
} from "./domain";
import { OUTCOMES } from "../lib/outcomes";

export const DATA_FILE_LIMIT = 5 * 1024 * 1024;
export const DATA_ROW_LIMIT = 10_000;
const COLUMN_LIMIT = 100;
const CELL_LIMIT = 50_000;
export type ImportMode = "insert_only" | "fill_blanks";
export type ImportColumn = { key: string; label: string };
export type ParsedSheet = { headers: string[]; rows: string[][] };
export type ImportIssue = { row: number; message: string };
export type ImportPreview = {
  leads: Lead[];
  added: number;
  updated: number;
  skipped: number;
  issues: ImportIssue[];
};
export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "business", label: "Business name" },
  { key: "phone", label: "Main phone" },
  { key: "contact", label: "Contact name" },
  { key: "role", label: "Contact role" },
  { key: "direct", label: "Direct number" },
  { key: "email", label: "Contact email" },
  { key: "category", label: "Industry / category" },
  { key: "city", label: "City / area" },
  { key: "zone", label: "IANA timezone" },
  { key: "website", label: "Website" },
  { key: "notes", label: "Research notes" },
];

/** RFC 4180 parser with bounded cells and explicit malformed-quote errors. */
export function parseCsv(text: string, delimiter = ","): ParsedSheet {
  if (new TextEncoder().encode(text).byteLength > DATA_FILE_LIMIT)
    throw new Error("Choose a file smaller than 5 MB.");
  if (!text.trim()) throw new Error("The file has no rows.");
  if (delimiter.length !== 1 || /[\r\n"]/.test(delimiter))
    throw new Error("Choose a single-character delimiter.");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const field = () => {
    row.push(value.trim());
    value = "";
    closed = false;
    if (row.length > COLUMN_LIMIT) throw new Error("A file can contain at most 100 columns.");
  };
  const line = () => {
    field();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > DATA_ROW_LIMIT + 1) throw new Error("Import at most 10,000 rows per file.");
  };
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === delimiter) field();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      line();
    } else if (char === '"') {
      if (value.trim() || closed)
        throw new Error("A quoted field must start immediately after a delimiter.");
      value = "";
      quoted = true;
    } else {
      if (closed && char.trim()) throw new Error("Unexpected text after a closing quote.");
      if (!closed) value += char;
    }
    if (value.length > CELL_LIMIT) throw new Error("A field exceeds 50,000 characters.");
  }
  if (quoted) throw new Error("The file contains an unclosed quoted field.");
  if (value || row.length || closed) line();
  return sheetFromRows(rows);
}
export function sheetFromRows(rows: string[][]): ParsedSheet {
  const [header, ...body] = rows;
  if (!header?.length || !body.length)
    throw new Error("Include a header row and at least one data row.");
  const headers = header.map((value, i) => value.trim() || `Column ${i + 1}`);
  if (headers.length > COLUMN_LIMIT || body.length > DATA_ROW_LIMIT)
    throw new Error("Import at most 100 columns and 10,000 rows.");
  if (body.some((row) => row.length > headers.length))
    throw new Error("A data row has more columns than the header. Check its delimiters.");
  return { headers, rows: body.map((row) => headers.map((_, i) => row[i] ?? "")) };
}
export function columnsFor(fields: CustomField[]): ImportColumn[] {
  return [
    ...IMPORT_COLUMNS,
    ...fields.map((field) => ({ key: `custom:${field.id}`, label: `${field.label} (custom)` })),
  ];
}
export function guessMappings(headers: string[], fields: CustomField[]): string[] {
  const candidates = columnsFor(fields),
    used = new Set<string>();
  const aliases: Record<string, string[]> = {
    business: ["businessname", "company", "companyname", "business"],
    phone: ["phone", "phone1", "mainphone", "telephone"],
    contact: ["contactname", "contact", "ownername", "owner"],
    role: ["role", "contactrole"],
    direct: ["direct", "directnumber", "directphone"],
    email: ["email", "contactemail"],
    category: ["industry", "category"],
    city: ["city", "area", "market"],
    zone: ["timezone", "zone", "ianatimezone"],
    notes: ["notes", "researchnotes"],
    website: ["website", "url"],
  };
  return headers.map((header) => {
    const clean = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    const item = candidates.find(
      (candidate) =>
        !used.has(candidate.key) &&
        ((aliases[candidate.key] ?? []).includes(clean) ||
          candidate.label.toLowerCase().replace(/[^a-z0-9]/g, "") === clean),
    );
    if (item) used.add(item.key);
    return item?.key ?? "skip";
  });
}
function customValue(raw: string, field: CustomField): CustomValue {
  if (raw === "") return null;
  if (field.type === "number") return Number(/^'-?\d+(?:\.\d+)?$/.test(raw) ? raw.slice(1) : raw);
  if (field.type === "checkbox") {
    if (/^(true|yes|1)$/i.test(raw)) return true;
    if (/^(false|no|0)$/i.test(raw)) return false;
    throw new Error(`${field.label} must be yes/no, true/false, or 1/0.`);
  }
  return raw;
}
export function previewImport(
  sheet: ParsedSheet,
  mappings: string[],
  state: Pick<State, "leads" | "customFields" | "suppressedNumbers">,
  mode: ImportMode,
  defaultZone: string,
  createId: () => string = () => crypto.randomUUID(),
): ImportPreview {
  if (!isValidZone(defaultZone)) throw new Error("Choose a valid default timezone.");
  if (mappings.length !== sheet.headers.length)
    throw new Error("Map every source column or choose Skip.");
  if (!mappings.includes("business") || !mappings.includes("phone"))
    throw new Error("Map Business name and Main phone before reviewing.");
  const active = mappings.filter((mapping) => mapping !== "skip");
  if (new Set(active).size !== active.length)
    throw new Error("Map each destination field only once.");
  if (active.some((key) => !columnsFor(state.customFields).some((field) => field.key === key)))
    throw new Error("A mapped field no longer exists. Update the mapping.");
  const leads: Lead[] = [],
    issues: ImportIssue[] = [];
  let added = 0,
    updated = 0,
    skipped = 0;
  const seen = new Set<string>();
  const saved = new Map(
    state.leads.flatMap((lead) => leadPhones(lead).map((phone) => [phone, lead] as const)),
  );
  for (const [index, cells] of sheet.rows.entries()) {
    try {
      const values = Object.fromEntries(mappings.map((key, i) => [key, cells[i]?.trim() ?? ""]));
      const business = values["business"] ?? "",
        phone = dialNumber((values["phone"] ?? "").replace(/^'(?=\+\d+$)/, ""));
      if (!business) throw new Error("Business name is blank.");
      if (!phone) throw new Error("Main phone is invalid; use 10-digit US or +country code.");
      const rawDirect = values["direct"] ?? "",
        direct = rawDirect ? dialNumber(rawDirect.replace(/^'(?=\+\d+$)/, "")) : "";
      if (rawDirect && !direct) throw new Error("Direct number is invalid.");
      const phones = [phone, direct].filter((p): p is string => Boolean(p));
      if (
        phones.some(
          (value) =>
            state.suppressedNumbers.includes(value) ||
            saved.get(value)?.suppressed ||
            saved.get(value)?.outcome === "do_not_call",
        )
      )
        throw new Error("Number is on the do-not-call list.");
      if (phones.some((value) => seen.has(value)))
        throw new Error("Duplicate number in this file; only the first valid row is considered.");
      const email = values["email"] ?? "",
        zone = values["zone"] || defaultZone;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Email address is invalid.");
      if (!isValidZone(zone)) throw new Error("Timezone is not a valid IANA zone.");
      const customValues: Record<string, CustomValue> = {};
      for (const field of state.customFields)
        if (mappings.includes(`custom:${field.id}`))
          customValues[field.id] = customValue(values[`custom:${field.id}`] ?? "", field);
      const problem = validateCustomValues(state.customFields, customValues);
      if (problem) throw new Error(problem);
      const matches = [...new Set(phones.map((p) => saved.get(p)).filter(Boolean))];
      if (matches.length > 1)
        throw new Error(
          "These numbers belong to different existing leads; resolve this row manually.",
        );
      const existing = matches[0];
      phones.forEach((value) => seen.add(value));
      if (existing && mode === "insert_only") {
        skipped++;
        continue;
      }
      const incoming: Lead = {
        id: createId(),
        business,
        phone,
        direct: direct || "",
        contact: values["contact"] ?? "",
        role: values["role"] ?? "",
        email,
        zone,
        category: values["category"] ?? "",
        city: values["city"] ?? "",
        website: values["website"] ?? "",
        notes: values["notes"] ?? "",
        outcome: "",
        calls: 0,
        callback: false,
        callbackAt: "",
        callbackReason: "",
        triage: false,
        offered: false,
        customValues,
      };
      if (existing) {
        const merged = { ...existing, customValues: { ...existing.customValues } };
        let changed = false;
        for (const key of [
          "business",
          "category",
          "city",
          "zone",
          "phone",
          "contact",
          "role",
          "direct",
          "email",
          "website",
          "notes",
        ] as const) {
          if (!merged[key] && incoming[key]) {
            merged[key] = incoming[key];
            changed = true;
          }
        }
        for (const [key, value] of Object.entries(customValues)) {
          if (
            (merged.customValues[key] === undefined ||
              merged.customValues[key] === null ||
              merged.customValues[key] === "") &&
            value !== null &&
            value !== ""
          ) {
            merged.customValues[key] = value;
            changed = true;
          }
        }
        if (!changed) {
          skipped++;
          continue;
        }
        for (const value of leadPhones(merged)) saved.set(value, merged);
        updated++;
      } else {
        added++;
        for (const value of phones) saved.set(value, incoming);
      }
      leads.push(incoming);
    } catch (error) {
      issues.push({
        row: index + 2,
        message: error instanceof Error ? error.message : "This row could not be read.",
      });
      skipped++;
    }
  }
  return { leads, added, updated, skipped, issues };
}

/** Neutralize spreadsheet formula prefixes, including values preceded by spaces/tabs. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function toCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
export function leadsCsv(state: Pick<State, "leads" | "customFields">): string {
  const visible = state.customFields;
  return toCsv([
    [
      "Business",
      "Phone",
      "Contact",
      "Role",
      "Direct number",
      "Email",
      "Category",
      "City",
      "Timezone",
      "Website",
      "Research notes",
      "Outcome",
      "Calls",
      ...visible.map((field) => field.label),
    ],
    ...state.leads.map((lead) => [
      lead.business,
      lead.phone,
      lead.contact,
      lead.role,
      lead.direct,
      lead.email,
      lead.category,
      lead.city,
      lead.zone,
      lead.website,
      lead.notes,
      lead.outcome,
      lead.calls,
      ...visible.map((field) => lead.customValues?.[field.id] ?? ""),
    ]),
  ]);
}
export function historyCsv(state: Pick<State, "logs" | "leads">): string {
  return toCsv([
    [
      "Call ID",
      "Business",
      "Phone",
      "Started at",
      "Answered at",
      "Ended at",
      "Elapsed seconds",
      "Talk seconds",
      "Outcome",
      "Notes",
      "Session ID",
      "Triage held",
      "Offered",
      "Booked",
      "Participants",
    ],
    ...state.logs.map((log) => [
      log.id,
      state.leads.find((lead) => lead.id === log.leadId)?.business ?? "Deleted lead",
      log.phone,
      log.at,
      log.answeredAt ?? "",
      log.endedAt ?? "",
      log.seconds,
      log.talkSeconds ?? Math.max(0, log.seconds - (log.heldSeconds ?? 0)),
      log.outcome,
      log.notes,
      log.sessionId,
      log.triage,
      log.offered,
      log.booked,
      log.participants.map((p) => `${p.name} ${p.phone}`).join("; "),
    ]),
  ]);
}
export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const short = z.string().max(CELL_LIMIT),
  id = z.string().min(1).max(200);
const count = z.number().finite().int().nonnegative();
const instant = short.refine(
  (value) => /T/.test(value) && Number.isFinite(Date.parse(value)),
  "Invalid timestamp",
);
const zone = short.refine(isValidZone, "Invalid timezone");
const outcome = short.refine(
  (value) => value === "" || OUTCOMES.some((o) => o.value === value),
  "Unknown outcome",
);
const custom = z.union([z.string().max(CELL_LIMIT), z.number().finite(), z.boolean(), z.null()]);
const contactSchema = z
  .object({ id, name: short, role: short, phone: short, email: short })
  .strict();
const leadSchema = z
  .object({
    id,
    business: short.min(1),
    category: short,
    city: short,
    zone,
    phone: short.refine((v) => Boolean(dialNumber(v))),
    contact: short,
    role: short,
    direct: short,
    email: short,
    website: short,
    notes: short,
    talkingPoints: short.optional(),
    outcome,
    calls: count,
    callback: z.boolean(),
    callbackAt: short,
    callbackReason: short,
    triage: z.boolean(),
    offered: z.boolean(),
    contacts: z.array(contactSchema).max(200).optional(),
    customValues: z.record(custom).optional(),
    stageId: short.optional(),
    suppressed: z.boolean().optional(),
    callbackOccurrence: z.number().int().min(0).max(1).optional(),
  })
  .strict();
const participantSchema = z.object({ phone: short, name: short }).strict();
const logSchema = z
  .object({
    id,
    // Legacy foreign keys use ON DELETE SET NULL; archive rows map that to "".
    leadId: short,
    phone: short,
    at: instant,
    seconds: count,
    outcome,
    notes: short,
    recording: z.boolean(),
    triage: z.boolean(),
    offered: z.boolean(),
    booked: z.boolean(),
    callback: z.boolean(),
    sessionId: id.nullable(),
    participants: z.array(participantSchema).max(100),
    heldSeconds: count.optional(),
    talkSeconds: count.optional(),
    ringingSeconds: count.optional(),
    answeredAt: instant.optional(),
    endedAt: instant.optional(),
    bookingIds: z.array(id).max(1000).optional(),
  })
  .strict();
const bookingSchema = z
  .object({
    id,
    leadId: short,
    title: short,
    at: instant,
    zone,
    duration: z.number().finite().positive().max(1440),
    guests: short,
    notes: short,
    meet: z.boolean(),
    originatingCallId: id.optional(),
    location: short.optional(),
    googleEventUrl: short.url().optional(),
    meetUrl: short.url().optional(),
  })
  .strict();
const sessionSchema = z
  .object({
    id,
    name: short,
    leadIds: z.array(id).max(DATA_ROW_LIMIT),
    paused: z.boolean(),
    status: z.enum(["ready", "paused", "stopped"]),
    elapsedMs: z.number().finite().nonnegative(),
    startedAt: z.null(),
  })
  .strict();
const templateSchema = z
  .object({ id, name: short, kind: z.enum(["opener", "gatekeeper", "voicemail"]), body: short })
  .strict();
const stageSchema = z
  .object({
    id,
    label: short,
    terminal: z.boolean(),
    noFollowUps: z.boolean(),
    outcomes: z.array(outcome).max(100),
  })
  .strict();
const customFieldSchema = z
  .object({
    id,
    label: short,
    type: z.enum(["text", "number", "date", "select", "checkbox", "url"]),
    options: z.array(short).max(500),
    showInTable: z.boolean(),
  })
  .strict();
const followUpSchema = z
  .object({
    id,
    leadId: id,
    contactId: id.optional(),
    at: instant,
    zone,
    reason: short,
    status: z.enum(["pending", "completed", "cancelled"]),
  })
  .strict();
const batchSchema = z
  .object({ id, at: instant, added: count, updated: count, skipped: count })
  .strict();
const dataSchema = z
  .object({
    preferences: z
      .object({ workspaceName: short, displayName: short, email: short, microphone: short })
      .strict(),
    recordingEnabled: z.boolean(),
    leads: z.array(leadSchema).max(DATA_ROW_LIMIT),
    logs: z.array(logSchema).max(DATA_ROW_LIMIT),
    bookings: z.array(bookingSchema).max(DATA_ROW_LIMIT),
    sessions: z.array(sessionSchema).max(DATA_ROW_LIMIT),
    templates: z.array(templateSchema).max(1000),
    stages: z.array(stageSchema).max(1000),
    customFields: z.array(customFieldSchema).max(1000),
    followUps: z.array(followUpSchema).max(DATA_ROW_LIMIT),
    importBatches: z.array(batchSchema).max(DATA_ROW_LIMIT),
    suppressedNumbers: z.array(short.refine((v) => Boolean(dialNumber(v)))).max(DATA_ROW_LIMIT),
  })
  .strict();
const backupSchema = z
  .object({
    app: z.literal("callboard"),
    version: z.literal(1),
    exportedAt: instant,
    data: dataSchema,
  })
  .strict();
export type BackupEnvelope = {
  app: "callboard";
  version: 1;
  exportedAt: string;
  data: DataSnapshot;
};
export function makeBackup(state: State, now = Date.now()): BackupEnvelope {
  if (state.call?.active) throw new Error("End the current call before making a full backup.");
  const data = {
    preferences: { ...state.preferences },
    recordingEnabled: state.recordingEnabled,
    leads: state.leads,
    logs: state.logs,
    bookings: state.bookings,
    sessions: state.sessions.map((session) => ({
      ...session,
      status: session.status === "running" ? "paused" : session.status,
      paused: session.status === "running" || session.paused,
      elapsedMs:
        session.elapsedMs +
        (session.status === "running" && session.startedAt !== null
          ? Math.max(0, now - session.startedAt)
          : 0),
      startedAt: null,
    })),
    templates: state.templates,
    stages: state.stages,
    customFields: state.customFields,
    followUps: state.followUps,
    importBatches: state.importBatches,
    suppressedNumbers: state.suppressedNumbers,
  };
  return backupSchema.parse({
    app: "callboard",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    data,
  }) as unknown as BackupEnvelope;
}
export function parseBackup(text: string): BackupEnvelope {
  if (new TextEncoder().encode(text).byteLength > DATA_FILE_LIMIT)
    throw new Error("Choose a backup smaller than 5 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The backup is not valid JSON.");
  }
  rejectUnsafeKeys(raw);
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid Call Board backup: ${issue?.path.join(".") || "file"} ${issue?.message ?? "schema mismatch"}. Credentials, session state and unsupported fields are never restored.`,
    );
  }
  const result = parsed.data as unknown as BackupEnvelope;
  return { ...result, data: validateSnapshot(result.data) };
}
function rejectUnsafeKeys(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error("The backup is nested too deeply.");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("The backup contains an unsupported object key.");
    rejectUnsafeKeys(child, depth + 1);
  }
}
/** Strict data-only validator shared by backup restore and local persistence. */
export function validateSnapshot(value: unknown): DataSnapshot {
  rejectUnsafeKeys(value);
  const parsed = dataSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid saved data: ${issue?.path.join(".") || "data"} ${issue?.message ?? "schema mismatch"}.`,
    );
  }
  const result = parsed.data as unknown as DataSnapshot;
  for (const key of [
    "leads",
    "logs",
    "bookings",
    "sessions",
    "templates",
    "stages",
    "customFields",
    "followUps",
    "importBatches",
  ] as const) {
    const items = result[key];
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error(`Duplicate identifiers in ${key}.`);
  }
  for (const lead of result.leads) {
    const issue = validateCustomValues(result.customFields, lead.customValues);
    if (issue) throw new Error(issue);
    if (lead.contacts && new Set(lead.contacts.map((c) => c.id)).size !== lead.contacts.length)
      throw new Error("Duplicate contact identifiers.");
    for (const phone of [lead.direct, ...(lead.contacts ?? []).map((c) => c.phone)].filter(Boolean))
      if (!dialNumber(phone)) throw new Error("A saved contact number is invalid.");
  }
  return result;
}

// Minimal XLSX reader: bounded ZIP extraction and first worksheet only. No macros or code execute.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function unzipSpreadsheet(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  if (buffer.byteLength > DATA_FILE_LIMIT)
    throw new Error("Choose a spreadsheet smaller than 5 MB.");
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer),
    output = new Map<string, Uint8Array>();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("This is not a supported XLSX workbook.");
  const count = view.getUint16(end + 10, true),
    directory = view.getUint32(end + 16, true);
  if (
    count > 256 ||
    directory >= bytes.length ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true)
  )
    throw new Error("This workbook is too complex or uses an unsupported archive format.");
  let cursor = directory,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Invalid workbook directory.");
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      crc = view.getUint32(cursor + 16, true),
      compressed = view.getUint32(cursor + 20, true),
      size = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true),
      offset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extra + comment;
    if (
      cursor > end ||
      name.includes("..") ||
      name.startsWith("/") ||
      flags & 1 ||
      size > 8 * 1024 * 1024 ||
      total + size > 16 * 1024 * 1024 ||
      (method !== 0 && method !== 8)
    )
      throw new Error("The workbook exceeds safe parsing limits or is encrypted.");
    total += size;
    if (
      !/^(xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels))$/.test(
        name,
      )
    )
      continue;
    if (
      output.has(name) ||
      offset + 30 > bytes.length ||
      view.getUint32(offset, true) !== 0x04034b50
    )
      throw new Error("Invalid workbook entry.");
    const start =
      offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    if (start + compressed > directory) throw new Error("Invalid workbook entry size.");
    let content: Uint8Array;
    if (method === 0) content = bytes.slice(start, start + compressed);
    else {
      if (typeof DecompressionStream === "undefined")
        throw new Error("This browser cannot read XLSX. Save the sheet as CSV instead.");
      let stream: ReadableStream<Uint8Array>;
      try {
        stream = new Blob([bytes.slice(start, start + compressed)])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"));
      } catch {
        throw new Error("This browser cannot read XLSX. Save the sheet as CSV instead.");
      }
      const reader = stream.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > size || length > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Workbook decompression exceeded its declared size.");
        }
        chunks.push(next.value);
      }
      content = new Uint8Array(length);
      let pos = 0;
      for (const chunk of chunks) {
        content.set(chunk, pos);
        pos += chunk.length;
      }
    }
    if (content.length !== size || crc32(content) !== crc)
      throw new Error("The workbook is corrupted.");
    output.set(name, content);
  }
  return output;
}
export async function readXlsx(buffer: ArrayBuffer): Promise<ParsedSheet> {
  if (typeof DOMParser === "undefined") throw new Error("Spreadsheet parsing requires a browser.");
  const files = await unzipSpreadsheet(buffer),
    decoder = new TextDecoder();
  const xml = (name: string): Document => {
    const bytes = files.get(name);
    if (!bytes) throw new Error("The workbook is missing a worksheet.");
    const source = decoder.decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(source))
      throw new Error("Workbook XML declarations are not supported. Save the sheet as CSV.");
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("The workbook contains invalid XML.");
    return doc;
  };
  let firstSheet = "xl/worksheets/sheet1.xml";
  if (files.has("xl/workbook.xml") && files.has("xl/_rels/workbook.xml.rels")) {
    const workbook = xml("xl/workbook.xml"),
      relation = workbook.getElementsByTagName("sheet")[0]?.getAttribute("r:id");
    const target = [...xml("xl/_rels/workbook.xml.rels").getElementsByTagName("Relationship")]
      .find((item) => item.getAttribute("Id") === relation)
      ?.getAttribute("Target");
    if (target) firstSheet = target.startsWith("/xl/") ? target.slice(1) : `xl/${target}`;
  }
  const shared = files.has("xl/sharedStrings.xml")
    ? [...xml("xl/sharedStrings.xml").getElementsByTagName("si")].map((item) =>
        [...item.getElementsByTagName("t")].map((n) => n.textContent ?? "").join(""),
      )
    : [];
  const sheet = xml(firstSheet),
    rows: string[][] = [];
  for (const node of [...sheet.getElementsByTagName("row")]) {
    if (rows.length > DATA_ROW_LIMIT) throw new Error("Import at most 10,000 spreadsheet rows.");
    const row: string[] = [];
    for (const cell of [...node.getElementsByTagName("c")]) {
      if (cell.getElementsByTagName("f").length)
        throw new Error(
          "The worksheet contains formulas. Paste values into a clean sheet or save as CSV.",
        );
      const reference = cell.getAttribute("r")?.match(/^([A-Z]+)\d+$/)?.[1];
      if (!reference) throw new Error("The worksheet contains an unsupported cell address.");
      let index = 0;
      for (const c of reference) index = index * 26 + c.charCodeAt(0) - 64;
      index--;
      if (index >= COLUMN_LIMIT) throw new Error("Import at most 100 columns.");
      const type = cell.getAttribute("t"),
        raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      const value =
        type === "s"
          ? (shared[Number(raw)] ?? "")
          : type === "inlineStr"
            ? [...cell.getElementsByTagName("t")].map((n) => n.textContent ?? "").join("")
            : type === "b"
              ? raw === "1"
                ? "true"
                : "false"
              : raw;
      if (value.length > CELL_LIMIT)
        throw new Error("A spreadsheet cell exceeds 50,000 characters.");
      row[index] = value;
    }
    if (row.some(Boolean)) rows.push(Array.from({ length: row.length }, (_, i) => row[i] ?? ""));
  }
  return sheetFromRows(rows);
}
