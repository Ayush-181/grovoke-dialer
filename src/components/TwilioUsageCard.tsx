import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getTwilioUsage } from "@/lib/twilio.functions";

function money(v: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

export function TwilioUsageCard() {
  const { workspace } = useWorkspace();
  const { data, isLoading } = useQuery({
    queryKey: ["twilio-usage", workspace?.id],
    enabled: !!workspace,
    refetchInterval: 5 * 60_000,
    queryFn: () => getTwilioUsage({ data: { workspaceId: workspace!.id } }),
  });

  return (
    <div className="panel mt-4 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Twilio usage</h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          this month
        </span>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading usage…</p>}
      {data && !data.ok && <p className="text-xs text-muted-foreground">{data.error}</p>}

      {data?.ok && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Balance", value: data.balance === null ? "—" : money(data.balance, data.currency) },
              { label: "Spend this month", value: money(data.monthSpend, data.currency) },
              { label: "Calls", value: data.calls.toLocaleString() },
              { label: "Call minutes", value: Math.round(data.callMinutes).toLocaleString() },
              { label: "Days left at burn rate", value: data.daysLeft === null ? "—" : `${data.daysLeft}d` },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-surface p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {k.label}
                </div>
                <div className="mono mt-1 text-lg font-semibold">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Category</th>
                  <th className="px-2 py-2 text-right font-medium">Count</th>
                  <th className="px-2 py-2 text-right font-medium">Usage</th>
                  <th className="px-2 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-xs text-muted-foreground">
                      No usage recorded this month.
                    </td>
                  </tr>
                )}
                {data.categories.map((c) => (
                  <tr key={c.category} className="border-b border-border/60">
                    <td className="px-2 py-1.5">{c.description}</td>
                    <td className="mono px-2 py-1.5 text-right text-xs">{c.count.toLocaleString()}</td>
                    <td className="mono px-2 py-1.5 text-right text-xs">
                      {c.usage} {c.usageUnit}
                    </td>
                    <td className="mono px-2 py-1.5 text-right text-xs">
                      {money(c.price, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
