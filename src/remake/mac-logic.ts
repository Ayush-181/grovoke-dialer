import { dialNumber } from "./numbers";
import { isSuppressed, leadPhones } from "./domain";
import type { State, Log } from "./model";
import { dateKey, inPeriod, metrics } from "./metrics";

export function suppressedNumber(state: State, value: string) {
  const phone = dialNumber(value);
  return Boolean(
    phone &&
    (state.suppressedNumbers.includes(phone) ||
      state.leads.some((lead) => isSuppressed(lead) && leadPhones(lead).includes(phone))),
  );
}
export function parseDialpad(value: string, country: string) {
  const raw = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  const local =
    raw.startsWith("+") || (digits.length === country.length + 10 && digits.startsWith(country))
      ? digits.slice(country.length)
      : digits;
  if (raw.startsWith("+") && !digits.startsWith(country)) return null;
  const valid =
    country === "1"
      ? /^[2-9]\d{2}[2-9]\d{6}$/.test(local)
      : country === "91"
        ? /^[6-9]\d{9}$/.test(local)
        : /^[1-9]\d{9}$/.test(local);
  return valid ? dialNumber(`+${country}${local}`) : null;
}
export function callingHours(now: Date, zone: string) {
  if (!zone) return null;
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(p.find((x) => x.type === "hour")?.value);
  const day = p.find((x) => x.type === "weekday")?.value;
  return day !== "Sat" && day !== "Sun" && hour >= 9 && hour < 17;
}
export function activityDays(logs: Log[], month: string, days: number, now = new Date()) {
  const today = dateKey(now);
  const last = today.startsWith(month)
    ? today
    : `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()}`;
  const end = new Date(`${last}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - (days - 1 - i));
    const key = day.toISOString().slice(0, 10);
    return { key, ...metrics(inPeriod(logs, key)) };
  });
}
export function runway(balance: number | null, dailyCost: number) {
  return balance === null ||
    !Number.isFinite(balance) ||
    !Number.isFinite(dailyCost) ||
    dailyCost <= 0
    ? null
    : Math.max(0, Math.floor(balance / dailyCost));
}
