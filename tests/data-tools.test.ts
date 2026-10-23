import { describe, expect, test } from "bun:test";
import { initialState } from "../src/remake/model";
import {
  csvCell,
  guessMappings,
  leadsCsv,
  makeBackup,
  parseBackup,
  parseCsv,
  previewImport,
  unzipSpreadsheet,
  validateSnapshot,
} from "../src/remake/data-tools";

const idMaker = () => {
  let n = 0;
  return () => `import-${++n}`;
};
describe("bounded import parsing and mapping", () => {
  test("parses BOM, commas, escaped quotes, CRLF and quoted multiline notes", () => {
    const result = parseCsv(
      '\uFEFFBusiness,Phone,Notes\r\n"A, B",2125550199,"He said ""hello""\nsecond line"\r\n',
    );
    expect(result.headers).toEqual(["Business", "Phone", "Notes"]);
    expect(result.rows).toEqual([["A, B", "2125550199", 'He said "hello"\nsecond line']]);
  });
  test("rejects malformed quotes and rows wider than the header", () => {
    expect(() => parseCsv('Business,Phone\nA,"2125550199')).toThrow("unclosed");
    expect(() => parseCsv('Business,Phone\nA,"2125550199"wrong')).toThrow("Unexpected");
    expect(() => parseCsv("Business,Phone\nA,2125550199,extra")).toThrow("more columns");
  });
  test("never assumes Phone 2 is a contact's direct number", () => {
    expect(guessMappings(["Business", "Phone", "Phone 2", "Direct number"], [])).toEqual([
      "business",
      "phone",
      "skip",
      "direct",
    ]);
  });
  test("normalizes valid new numbers, skips canonical duplicates and reports invalid rows", () => {
    const state = initialState();
    const sheet = parseCsv(
      "Business,Phone\nNew,(212) 555-0199\nDuplicate,+12125550199\nInvalid,hello",
    );
    const result = previewImport(
      sheet,
      ["business", "phone"],
      state,
      "insert_only",
      "America/New_York",
      idMaker(),
    );
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.leads[0]?.phone).toBe("+12125550199");
    expect(result.issues.map((issue) => issue.row)).toEqual([3, 4]);
    expect(result.leads[0]?.contacts).toBeUndefined();
    expect(result.leads[0]?.outcome).toBe("");
  });
  test("blocks suppressed numbers even if imported business name is different", () => {
    const state = initialState();
    const result = previewImport(
      parseCsv("Business,Phone\nOther,+12125550106"),
      ["business", "phone"],
      state,
      "fill_blanks",
      "America/New_York",
    );
    expect(result.leads).toHaveLength(0);
    expect(result.issues[0]?.message).toContain("do-not-call");
  });
  test("dry-run preserves existing content and skips a no-op merge", () => {
    const state = initialState();
    const first = state.leads[0]!;
    const sheet = parseCsv(`Business,Phone,Notes\nChanged,${first.phone},Do not overwrite`);
    const result = previewImport(
      sheet,
      ["business", "phone", "notes"],
      state,
      "fill_blanks",
      "America/New_York",
    );
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(first.business).toBe("Harborline Rentals");
    expect(first.notes).toContain("Independent rental");
  });
  test("fill-blanks preview counts actual existing updates, not all matches", () => {
    const state = initialState();
    state.leads[0]!.email = "";
    const sheet = parseCsv(
      `Business,Phone,Email\nChanged,${state.leads[0]!.phone},hello@example.invalid`,
    );
    const result = previewImport(
      sheet,
      ["business", "phone", "email"],
      state,
      "fill_blanks",
      "America/New_York",
    );
    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);
    expect(state.leads[0]!.email).toBe("");
  });
  test("rejects duplicate mappings and invalid custom field values", () => {
    const state = initialState();
    state.customFields = [
      { id: "size", label: "Size", type: "number", options: [], showInTable: true },
    ];
    const sheet = parseCsv("Business,Phone,Size\nNew,2125550199,not a number");
    expect(() =>
      previewImport(
        sheet,
        ["business", "phone", "phone"],
        state,
        "insert_only",
        "America/New_York",
      ),
    ).toThrow("only once");
    const result = previewImport(
      sheet,
      ["business", "phone", "custom:size"],
      state,
      "insert_only",
      "America/New_York",
    );
    expect(result.issues[0]?.message).toContain("number");
  });
  test("an invalid IANA timezone cannot enter an import", () => {
    const state = initialState();
    const result = previewImport(
      parseCsv("Business,Phone,Zone\nNew,2125550199,Not/A_Zone"),
      ["business", "phone", "zone"],
      state,
      "insert_only",
      "America/New_York",
    );
    expect(result.issues[0]?.message).toContain("Timezone");
  });
});

describe("portable safe exports and backups", () => {
  test("CSV neutralizes spreadsheet formulas with leading whitespace and preserves quotes", () => {
    expect(csvCell(' =HYPERLINK("https://example.invalid")')).toBe(
      '"\' =HYPERLINK(""https://example.invalid"")"',
    );
    expect(csvCell("\t@SUM(1)")).toBe('"\'\t@SUM(1)"');
    expect(csvCell("normal, value")).toBe('"normal, value"');
  });
  test("exported E.164 phones can be reimported despite spreadsheet protection", () => {
    const state = initialState(),
      sheet = parseCsv(leadsCsv(state));
    const result = previewImport(
      sheet,
      guessMappings(sheet.headers, state.customFields),
      { ...state, leads: [], suppressedNumbers: [] },
      "insert_only",
      "America/New_York",
    );
    expect(result.leads[0]?.phone).toBe(state.leads[0]?.phone);
  });
  test("backup roundtrip excludes active runtime and freezes session elapsed at export", () => {
    const state = initialState();
    state.sessions[0] = {
      ...state.sessions[0]!,
      status: "running",
      paused: false,
      startedAt: 1000,
      elapsedMs: 500,
    };
    const backup = makeBackup(state, 4000);
    expect(backup.data.sessions[0]?.elapsedMs).toBe(3500);
    expect(backup.data.sessions[0]?.status).toBe("paused");
    expect(backup.data.sessions[0]?.startedAt).toBeNull();
    expect(Object.keys(backup.data)).not.toContain("call");
    expect(parseBackup(JSON.stringify(backup)).data.leads).toHaveLength(state.leads.length);
  });
  test("rejects unsupported versions, credentials and invalid enums", () => {
    const backup = makeBackup(initialState());
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow(
      "Invalid Call Board",
    );
    expect(() =>
      parseBackup(
        JSON.stringify({ ...backup, data: { ...backup.data, token: "synthetic-not-a-key" } }),
      ),
    ).toThrow("Invalid Call Board");
    const invalid = structuredClone(backup);
    invalid.data.leads[0]!.outcome = "invented" as never;
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow("Unknown outcome");
  });
  test("rejects duplicate identifiers and prototype keys before restoring", () => {
    const backup = makeBackup(initialState());
    backup.data.leads.push({ ...backup.data.leads[0]! });
    expect(() => parseBackup(JSON.stringify(backup))).toThrow("Duplicate identifiers");
    expect(() => validateSnapshot(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow(
      "unsupported object key",
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  test("empty workspaces remain empty without introducing demo records", () => {
    const state = initialState();
    state.leads = [];
    state.logs = [];
    state.bookings = [];
    state.sessions = [];
    state.followUps = [];
    expect(parseBackup(JSON.stringify(makeBackup(state))).data.leads).toHaveLength(0);
  });
  test("archived calls and bookings remain portable after their lead foreign key is cleared", () => {
    const state = initialState();
    state.logs[0] = { ...state.logs[0]!, leadId: "" };
    state.bookings[0] = { ...state.bookings[0]!, leadId: "" };
    const restored = parseBackup(JSON.stringify(makeBackup(state))).data;
    expect(restored.logs[0]?.leadId).toBe("");
    expect(restored.bookings[0]?.leadId).toBe("");
    expect(restored.logs[0]?.notes).toBe(state.logs[0]?.notes);
  });
  test("removing a field definition preserves its primitive research values in backups", () => {
    const state = initialState();
    state.leads[0]!.customValues = { removed: "Keep this research", score: 0 };
    const restored = parseBackup(JSON.stringify(makeBackup(state))).data;
    expect(restored.leads[0]?.customValues).toEqual(state.leads[0]!.customValues);
  });
});

function storedZip(name: string, text: string, crc: number): ArrayBuffer {
  const n = new TextEncoder().encode(name),
    data = new TextEncoder().encode(text);
  const bytes = new Uint8Array(30 + n.length + data.length + 46 + n.length + 22),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, n.length, true);
  bytes.set(n, 30);
  bytes.set(data, 30 + n.length);
  const directory = 30 + n.length + data.length;
  view.setUint32(directory, 0x02014b50, true);
  view.setUint16(directory + 4, 20, true);
  view.setUint16(directory + 6, 20, true);
  view.setUint32(directory + 16, crc, true);
  view.setUint32(directory + 20, data.length, true);
  view.setUint32(directory + 24, data.length, true);
  view.setUint16(directory + 28, n.length, true);
  bytes.set(n, directory + 46);
  const end = directory + 46 + n.length;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, 46 + n.length, true);
  view.setUint32(end + 16, directory, true);
  return bytes.buffer;
}
describe("bounded XLSX ZIP handling", () => {
  test("reads stored worksheet bytes and verifies CRC", async () => {
    const files = await unzipSpreadsheet(
      storedZip("xl/worksheets/sheet1.xml", "hello", 0x3610a686),
    );
    expect(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml"))).toBe("hello");
    await expect(
      unzipSpreadsheet(storedZip("xl/worksheets/sheet1.xml", "hello", 0)),
    ).rejects.toThrow("corrupted");
  });
  test("rejects path traversal and invalid ZIPs", async () => {
    await expect(
      unzipSpreadsheet(storedZip("xl/../outside.xml", "hello", 0x3610a686)),
    ).rejects.toThrow("safe parsing");
    await expect(unzipSpreadsheet(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow(
      "not a supported",
    );
  });
});
