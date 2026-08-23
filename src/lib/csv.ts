/** Minimal RFC4180-ish CSV row splitter (quotes may appear anywhere in the row). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/**
 * Full RFC4180 parser: handles quoted fields anywhere in a row, escaped
 * quotes ("") and newlines inside quoted values.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  let sawAny = false;

  const endField = () => {
    row.push(cur.trim());
    cur = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.length > 0)) rows.push(row);
    row = [];
    sawAny = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      sawAny = true;
      continue;
    }
    if (ch === ",") {
      endField();
      sawAny = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      continue;
    }
    cur += ch;
    sawAny = true;
  }
  if (sawAny || cur.length > 0 || row.length > 0) endRow();
  return rows;
}

export const LEAD_FIELDS = [
  { key: "business_name", label: "Business name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "website", label: "Website" },
  { key: "email", label: "Email" },
  { key: "notes", label: "Notes" },
] as const;

export type LeadField = (typeof LEAD_FIELDS)[number]["key"];

const HINTS: Record<LeadField, string[]> = {
  business_name: ["business", "name", "company", "title"],
  phone: ["phone", "tel", "mobile", "number"],
  address: ["address", "street", "addr"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zip: ["zip", "postal"],
  website: ["website", "url", "site", "domain"],
  email: ["email", "mail"],
  notes: ["notes", "note", "comment", "description"],
};

/**
 * Guess a lead field -> column *index* mapping. Index-based so duplicate
 * header names can't collide. -1 means "not mapped".
 */
export function autoMap(headers: string[]): Record<LeadField, number> {
  const map = {} as Record<LeadField, number>;
  const used = new Set<number>();
  for (const field of LEAD_FIELDS) {
    const hints = HINTS[field.key];
    const idx = headers.findIndex((h, i) => {
      const lower = h.toLowerCase();
      return !used.has(i) && hints.some((hint) => lower.includes(hint));
    });
    map[field.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

/** Detect whether the first row looks like a header row. */
export function looksLikeHeader(row: string[]): boolean {
  const digitHeavy = row.filter((c) => /\d{4,}/.test(c)).length;
  return digitHeavy === 0 && row.some((c) => /[a-zA-Z]/.test(c));
}
