export type ZoneDef = {
  id: string;
  label: string;
  short: string;
  home?: boolean;
};

export const ZONES: ZoneDef[] = [
  { id: "Asia/Kolkata", label: "India", short: "IST", home: true },
  { id: "America/New_York", label: "Eastern", short: "ET" },
  { id: "America/Chicago", label: "Central", short: "CT" },
  { id: "America/Denver", label: "Mountain", short: "MT" },
  { id: "America/Phoenix", label: "Arizona (no DST)", short: "MST" },
  { id: "America/Los_Angeles", label: "Pacific", short: "PT" },
  { id: "America/Anchorage", label: "Alaska", short: "AKT" },
  { id: "Pacific/Honolulu", label: "Hawaii", short: "HST" },
  { id: "Europe/London", label: "London", short: "GMT/BST" },
  { id: "Europe/Berlin", label: "Berlin", short: "CET" },
  { id: "Asia/Dubai", label: "Dubai", short: "GST" },
  { id: "Asia/Singapore", label: "Singapore", short: "SGT" },
  { id: "UTC", label: "UTC", short: "UTC" },
];

export const HOME_ZONE = "Asia/Kolkata";

export function zoneDef(id: string): ZoneDef {
  return ZONES.find((z) => z.id === id) ?? { id, label: id, short: id };
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of `instant` rendered in `timeZone`, as a UTC-based epoch. */
function wallClockAsUtc(instant: Date, timeZone: string): number {
  const p = fmt(timeZone).formatToParts(instant);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0;
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

/** UTC offset (ms) of `timeZone` at `instant`. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  return wallClockAsUtc(instant, timeZone) - instant.getTime();
}

export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Convert an instant into wall-clock fields of a zone. */
export function instantToWallClock(instant: Date, timeZone: string): WallClock {
  const asUtc = new Date(wallClockAsUtc(instant, timeZone));
  return {
    year: asUtc.getUTCFullYear(),
    month: asUtc.getUTCMonth() + 1,
    day: asUtc.getUTCDate(),
    hour: asUtc.getUTCHours(),
    minute: asUtc.getUTCMinutes(),
  };
}

/**
 * Convert a typed wall-clock time in `timeZone` back into a real UTC instant.
 * Iterative refinement handles DST boundaries without a tz library.
 */
export function wallClockToInstant(wc: WallClock, timeZone: string): Date {
  const target = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const offset = zoneOffsetMs(new Date(guess), timeZone);
    const next = target - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

const displayCache = new Map<string, Intl.DateTimeFormat>();
function display(timeZone: string, kind: "time" | "date" | "abbr"): Intl.DateTimeFormat {
  const key = timeZone + "|" + kind;
  let f = displayCache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === "time"
        ? { timeZone, hour: "numeric", minute: "2-digit", hour12: true }
        : kind === "date"
          ? { timeZone, weekday: "short", month: "short", day: "numeric" }
          : { timeZone, timeZoneName: "short", hour: "numeric" };
    f = new Intl.DateTimeFormat("en-US", opts);
    displayCache.set(key, f);
  }
  return f;
}

export function formatTimeInZone(instant: Date, timeZone: string): string {
  return display(timeZone, "time").format(instant);
}

export function formatDateInZone(instant: Date, timeZone: string): string {
  return display(timeZone, "date").format(instant);
}

export function zoneAbbreviation(instant: Date, timeZone: string): string {
  const part = display(timeZone, "abbr")
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? zoneDef(timeZone).short;
}

/** Input value ("YYYY-MM-DDTHH:mm") for a datetime-local bound to a zone. */
export function toDateTimeLocalValue(instant: Date, timeZone: string): string {
  const wc = instantToWallClock(instant, timeZone);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(wc.year, 4)}-${p(wc.month)}-${p(wc.day)}T${p(wc.hour)}:${p(wc.minute)}`;
}

export function parseDateTimeLocalValue(value: string): WallClock | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

/* ---------- Lead zone derivation ---------- */

const STATE_ZONES: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Denver",
  IL: "America/Chicago",
  IN: "America/New_York",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/New_York",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
};

const AREA_CODE_ZONES: Record<string, string> = {
  // Eastern
  "212": "America/New_York",
  "646": "America/New_York",
  "718": "America/New_York",
  "917": "America/New_York",
  "215": "America/New_York",
  "305": "America/New_York",
  "404": "America/New_York",
  "617": "America/New_York",
  "202": "America/New_York",
  "313": "America/New_York",
  "704": "America/New_York",
  // Central
  "312": "America/Chicago",
  "773": "America/Chicago",
  "214": "America/Chicago",
  "713": "America/Chicago",
  "512": "America/Chicago",
  "615": "America/Chicago",
  "504": "America/Chicago",
  "612": "America/Chicago",
  // Mountain
  "303": "America/Denver",
  "720": "America/Denver",
  "801": "America/Denver",
  "406": "America/Denver",
  // Arizona
  "602": "America/Phoenix",
  "480": "America/Phoenix",
  "520": "America/Phoenix",
  // Pacific
  "213": "America/Los_Angeles",
  "310": "America/Los_Angeles",
  "415": "America/Los_Angeles",
  "503": "America/Los_Angeles",
  "206": "America/Los_Angeles",
  "702": "America/Los_Angeles",
  // Alaska / Hawaii
  "907": "America/Anchorage",
  "808": "Pacific/Honolulu",
};

export type DerivedZone = { zone: string; source: "state" | "area_code" | "unknown" };

/** Derive a lead's zone from state, then area code. Never guesses silently. */
export function deriveLeadZone(state?: string | null, phone?: string | null): DerivedZone {
  const st = (state ?? "").trim().toUpperCase();
  if (st.length === 2 && STATE_ZONES[st]) return { zone: STATE_ZONES[st]!, source: "state" };
  const digits = (phone ?? "").replace(/\D/g, "");
  const ac = digits.length >= 11 && digits.startsWith("1") ? digits.slice(1, 4) : digits.slice(0, 3);
  if (AREA_CODE_ZONES[ac]) return { zone: AREA_CODE_ZONES[ac]!, source: "area_code" };
  return { zone: "America/Chicago", source: "unknown" };
}
