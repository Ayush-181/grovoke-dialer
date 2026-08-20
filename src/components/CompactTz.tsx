import { useEffect, useMemo, useState } from "react";
import {
  HOME_ZONE,
  ZONES,
  deriveLeadZone,
  formatDateInZone,
  formatTimeInZone,
  zoneAbbreviation,
  zoneDef,
} from "@/lib/timezones";
import { cn } from "@/lib/utils";

type Props = {
  state?: string | null;
  phone?: string | null;
  className?: string;
  anchorZone?: string;
};

/** Compact "IST ⇄ lead zone" readout for the widget and dialer. */
export function CompactTz({ state, phone, className, anchorZone = HOME_ZONE }: Props) {
  const derived = useMemo(() => deriveLeadZone(state, phone), [state, phone]);
  const [override, setOverride] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => setOverride(null), [state, phone]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const leadZone = override ?? derived.zone;
  const unknown = derived.source === "unknown" && !override;

  return (
    <div className={cn("panel px-3 py-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {zoneDef(anchorZone).short} · You
          </div>
          <div className="mono text-base font-semibold text-primary">
            {formatTimeInZone(now, anchorZone)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {formatDateInZone(now, anchorZone)}
          </div>
        </div>
        <div className="text-muted-foreground">⇄</div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {zoneAbbreviation(now, leadZone)} · Lead
          </div>
          <div className="mono text-base font-semibold">{formatTimeInZone(now, leadZone)}</div>
          <div className="text-[10px] text-muted-foreground">
            {formatDateInZone(now, leadZone)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
            unknown ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
          )}
        >
          {override
            ? "manual"
            : derived.source === "state"
              ? "from state"
              : derived.source === "area_code"
                ? "from area code"
                : "zone unknown — pick one"}
        </span>
        <select
          value={leadZone}
          onChange={(e) => setOverride(e.target.value)}
          className="ml-auto rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
          aria-label="Override lead time zone"
        >
          {ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
