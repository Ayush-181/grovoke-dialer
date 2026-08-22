import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import {
  HOME_ZONE,
  ZONES,
  formatDateInZone,
  formatTimeInZone,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
  wallClockToInstant,
  zoneDef,
} from "@/lib/timezones";
import { PageHeader } from "@/components/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/timezones")({
  head: () => ({
    meta: [
      { title: "Time Zones — Call Board" },
      {
        name: "description",
        content:
          "Pick an anchor zone and read the matching local time in every calling zone on one card grid.",
      },
      { property: "og:title", content: "Time Zones — Call Board" },
      { property: "og:description", content: "IST to US calling-hours converter for dialers." },
    ],
  }),
  component: TimeZonesPage,
});

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

  const instant = useMemo(() => {
    if (live) return now;
    const wc = parseDateTimeLocalValue(value);
    return wc ? wallClockToInstant(wc, anchorZone) : now;
  }, [live, now, value, anchorZone]);

  useEffect(() => {
    if (live) setValue(toDateTimeLocalValue(instant, anchorZone));
  }, [live, instant, anchorZone]);

  function chooseAnchor(zoneId: string) {
    if (zoneId === anchorZone) return;
    setAnchorZone(zoneId);
    setValue(toDateTimeLocalValue(instant, zoneId));
  }

  function useNow() {
    const n = new Date();
    setNow(n);
    setValue(toDateTimeLocalValue(n, anchorZone));
    setLive(true);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Time Zone Converter"
        subtitle="One anchor, every calling zone at a glance."
        actions={
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Click any card to make it the anchor
          </span>
        }
      />

      <div className="panel mb-5 grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0 space-y-1.5">
          <label
            htmlFor="anchor-zone"
            className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground"
          >
            Anchor zone
          </label>
          <select
            id="anchor-zone"
            value={anchorZone}
            onChange={(e) => chooseAnchor(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          >
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label} · {z.short}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0 space-y-1.5">
          <label
            htmlFor="anchor-time"
            className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground"
          >
            Time in anchor zone
          </label>
          <input
            id="anchor-time"
            type="datetime-local"
            value={value}
            onChange={(e) => {
              setLive(false);
              setValue(e.target.value);
            }}
            className="mono w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="button"
          onClick={useNow}
          className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", live && "live-dot")} />
          Use Now
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ZONES.map((z) => {
          const isAnchor = z.id === anchorZone;
          const isHome = z.id === HOME_ZONE;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => chooseAnchor(z.id)}
              className={cn(
                "panel relative overflow-hidden p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                isAnchor && "border-primary bg-primary/5 ring-1 ring-primary/30",
                !isAnchor && isHome && "border-l-4 border-l-success",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {z.label} · {zoneDef(z.id).short}
                </div>
                {isAnchor ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Anchor
                  </span>
                ) : isHome ? (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success-foreground">
                    Home
                  </span>
                ) : null}
              </div>

              <div
                className={cn(
                  "mono mt-3 text-2xl font-bold tracking-tight",
                  isAnchor ? "text-primary" : "text-foreground",
                )}
              >
                {formatTimeInZone(instant, z.id)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatDateInZone(instant, z.id)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
