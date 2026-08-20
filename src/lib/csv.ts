/** Minimal RFC4180-ish CSV row splitter. */
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

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted && (cur.length === 0 || quoted);
      cur += ch;
      continue;
    }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur.trim().length) rows.push(splitCsvLine(cur));
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length) rows.push(splitCsvLine(cur));
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

/** Guess a header -> lead field mapping. */
export function autoMap(headers: string[]): Record<LeadField, string> {
  const map = {} as Record<LeadField, string>;
  const used = new Set<string>();
  for (const field of LEAD_FIELDS) {
    const hints = HINTS[field.key];
    const match = headers.find((h) => {
      const lower = h.toLowerCase();
      return !used.has(h) && hints.some((hint) => lower.includes(hint));
    });
    map[field.key] = match ?? "";
    if (match) used.add(match);
  }
  return map;
}

/** Detect whether the first row looks like a header row. */
export function looksLikeHeader(row: string[]): boolean {
  const digitHeavy = row.filter((c) => /\d{4,}/.test(c)).length;
  return digitHeavy === 0 && row.some((c) => /[a-zA-Z]/.test(c));
}
