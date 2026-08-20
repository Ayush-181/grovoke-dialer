import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  HOME_ZONE,
  ZONES,
  formatDateInZone,
  formatTimeInZone,
  instantToWallClock,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
  wallClockToInstant,
  zoneAbbreviation,
} from "@/lib/timezones";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/timezones")({
  head: () => ({
    meta: [
      { title: "Time Zones — Call Board" },
      {
        name: "description",
        content: "Convert your anchor time to every US calling zone and see who is inside hours.",
      },
      { property: "og:title", content: "Time Zones — Call Board" },
      { property: "og:description", content: "IST to US calling-hours converter for dialers." },
    ],
  }),
  component: TimeZonesPage,
});

const US_ZONES = ZONES.filter((z) => z.id !== HOME_ZONE);

function TimeZonesPage() {
  const [anchorZone, setAnchorZone] = useState(HOME_ZONE);
  const [live, setLive] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [value, setValue] = useState(() => toDateTimeLocalValue(new Date(), HOME_ZONE));

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => {
    if (live) setValue(toDateTimeLocalValue(now, anchorZone));
  }, [live, now, anchorZone]);

  const instant = useMemo(() => {
    if (live) return now;
    const wc = parseDateTimeLocalValue(value);
    return wc ? wallClockToInstant(wc, anchorZone) : now;
  }, [live, now, value, anchorZone]);

  return (
    <div>
      <PageHeader
        title="Time Zones"
        subtitle="Anchor your clock, then read every US zone at a glance."
        actions={
          <Button variant={live ? "default" : "outline"} size="sm" onClick={() => setLive(!live)}>
            {live ? "Live" : "Frozen"}
          </Button>
        }
      />

      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Anchor zone
          </label>
          <select
            value={anchorZone}
            onChange={(e) => setAnchorZone(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          >
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Anchor time
          </label>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => {
              setLive(false);
              setValue(e.target.value);
            }}
            className="mono rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {zoneAbbreviation(instant, anchorZone)}
          </div>
          <div className="mono text-2xl font-semibold text-primary">
            {formatTimeInZone(instant, anchorZone)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {formatDateInZone(instant, anchorZone)}
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Zone</th>
              <th className="px-3 py-2 text-left font-medium">Local time</th>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Calling window</th>
            </tr>
          </thead>
          <tbody>
            {US_ZONES.map((z) => {
              const wc = instantToWallClock(instant, z.id);
              const inHours = wc.hour >= 9 && wc.hour < 17;
              const edge = (wc.hour >= 8 && wc.hour < 9) || (wc.hour >= 17 && wc.hour < 19);
              return (
                <tr key={z.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{z.label}</div>
                    <div className="mono text-[10px] text-muted-foreground">
                      {zoneAbbreviation(instant, z.id)}
                    </div>
                  </td>
                  <td className="mono px-3 py-2 text-base">{formatTimeInZone(instant, z.id)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDateInZone(instant, z.id)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] uppercase tracking-wide",
                        inHours && "bg-primary/15 text-primary",
                        !inHours && edge && "bg-warning/15 text-warning",
                        !inHours && !edge && "bg-destructive/15 text-destructive",
                      )}
                    >
                      {inHours ? "prime 9–5" : edge ? "edge hours" : "off hours"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
