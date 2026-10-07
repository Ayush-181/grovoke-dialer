import { instantToWallClock, parseDateTimeLocalValue, zoneOffsetMs } from "./timezones";

export type BusyPeriod = { start: string; end: string };

/** Return zero (DST gap), one (ordinary), or two (DST fold) matching instants. */
export function bookingInstants(value: string, zone: string): Date[] {
  const wall = parseDateTimeLocalValue(value);
  if (!wall) return [];
  const target = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    offsets.add(zoneOffsetMs(new Date(target + h * 3_600_000), zone));
  }
  return [...offsets]
    .map((offset) => new Date(target - offset))
    .filter((date) => {
      const actual = instantToWallClock(date, zone);
      return Object.entries(wall).every(([key, n]) => actual[key as keyof typeof actual] === n);
    })
    .sort((a, b) => a.getTime() - b.getTime());
}

export function overlapsBusy(start: Date, duration: number, busy: BusyPeriod[]): boolean {
  const end = start.getTime() + duration * 60_000;
  return busy.some(
    (period) => start.getTime() < Date.parse(period.end) && end > Date.parse(period.start),
  );
}

export function nextWeekdays(date: string, count = 5): string[] {
  const day = new Date(`${date}T12:00:00Z`);
  const days: string[] = [];
  while (days.length < count) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) days.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return days;
}

export function displayBookingTime(instant: Date, zone: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
  return zone === "Asia/Kolkata" ? formatted.replace("GMT+5:30", "IST") : formatted;
}
