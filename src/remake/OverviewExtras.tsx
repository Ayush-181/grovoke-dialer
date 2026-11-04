import { useEffect, useState } from "react";
import { Panel, Field } from "./components";
import { useRuntime } from "./runtime";
import type { Action, State } from "./model";
import { dateKey, inPeriod } from "./metrics";
import { runway } from "./mac-logic";
import { instantToWallClock, wallClockToInstant } from "../lib/timezones";
import { timeAt } from "./format";
import type { TwilioUsageResult } from "../lib/twilio.functions";
type Props = { state: State; dispatch: (action: Action) => boolean | Promise<boolean> };
export function GoalPanel({ state, dispatch }: Props) {
  const goal = state.preferences.dailyGoal ?? 80,
    from = state.preferences.bestFrom ?? 9,
    to = state.preferences.bestTo ?? 11;
  const count = inPeriod(state.logs, dateKey(new Date())).length;
  const wall = instantToWallClock(new Date(), "America/Chicago");
  const windowText = [from, to]
    .map((hour) =>
      timeAt(wallClockToInstant({ ...wall, hour, minute: 0 }, "America/Chicago"), "Asia/Kolkata"),
    )
    .join(" – ");
  return (
    <Panel className="mx-goal">
      <svg viewBox="0 0 80 80" role="img" aria-label={`${count} of ${goal} daily dials`}>
        <circle cx="40" cy="40" r="32" />
        <circle
          cx="40"
          cy="40"
          r="32"
          strokeDasharray={`${Math.min(1, count / Math.max(1, goal)) * 201.06} 201.06`}
        />
      </svg>
      <div>
        <strong>{Math.max(0, goal - count)} dials to go</strong>
        <p className="hint">
          {count} today · {goal} goal
        </p>
        <details>
          <summary>Edit goal & calling window</summary>
          <Field
            label="Daily dial goal"
            type="number"
            min={1}
            max={10000}
            value={goal}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n > 0 && n <= 10000)
                void dispatch({ type: "preferences", patch: { dailyGoal: n } });
            }}
          />
          <Field
            label="Austin start hour"
            type="number"
            min={0}
            max={23}
            value={from}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 0 && n < to)
                void dispatch({ type: "preferences", patch: { bestFrom: n } });
            }}
          />
          <Field
            label="Austin end hour"
            type="number"
            min={1}
            max={23}
            value={to}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n > from && n <= 23)
                void dispatch({ type: "preferences", patch: { bestTo: n } });
            }}
          />
        </details>
        <p className="hint">Your chosen Austin window today: {windowText}</p>
      </div>
    </Panel>
  );
}
export function BalancePanel({ state, dispatch }: Props) {
  const runtime = useRuntime();
  const [result, setResult] = useState<TwilioUsageResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [scenario, setScenario] = useState(false);
  const getUsage = runtime.getUsage;
  useEffect(() => {
    if (!getUsage) return;
    let current = true;
    setLoading(true);
    setError("");
    void getUsage()
      .then((data) => {
        if (current) setResult(data);
      })
      .catch((e) => {
        if (current) setError(e instanceof Error ? e.message : "Could not load usage.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [getUsage, retry]);
  const data = result?.ok ? result : null;
  const rate = state.preferences.scenarioRate ?? 0,
    minutes = state.preferences.scenarioMinutes ?? 1;
  const dailyCost = scenario
    ? (state.preferences.dailyGoal ?? 80) * rate * minutes
    : (data?.sevenDaySpend ?? 0) / 7;
  const days = runway(data?.balance ?? null, dailyCost);
  const money = (n: number) =>
    new Intl.NumberFormat("en", { style: "currency", currency: data?.currency ?? "USD" }).format(n);
  const categories = data?.sevenDayCategories ?? [];
  const rows = [
    { label: "Calls", key: "calls", categories: ["calls", "calls-client", "calls-sip"] },
    { label: "Call recording", key: "recordings", categories: ["recordings", "recordingstorage"] },
    {
      label: "AI transcripts",
      key: "transcriptions",
      categories: ["transcriptions", "voice-intelligence-transcription"],
    },
  ];
  return (
    <Panel className="mx-balance">
      <h2>Balance</h2>
      {!getUsage ? (
        <p className="hint">
          Connect your Twilio account in the live workspace to see balance and spend.
        </p>
      ) : loading ? (
        <p role="status">Loading usage…</p>
      ) : error || (result && !result.ok) ? (
        <p role="alert">
          {error || (!result?.ok ? result?.error : "")}{" "}
          <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : (
        data && (
          <>
            <strong className="mono">
              {data.balance === null ? "Balance unavailable" : money(data.balance)}
            </strong>
            <p className="hint">
              {days === null
                ? "Set a rate to estimate remaining days"
                : `${days} days left · runs out about ${new Date(Date.now() + days * 86400000).toLocaleDateString()}`}{" "}
              · {scenario ? "Scenario" : "7-day pace"}
            </p>
            <dl>
              {rows.map((row) => {
                const found = categories.filter((c) => row.categories.includes(c.category));
                const category = found.length
                  ? { price: found.reduce((sum, c) => sum + c.price, 0) }
                  : null;
                return (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>
                      {category
                        ? money(category.price) +
                          (data.sevenDaySpend
                            ? ` · ${Math.round((category.price / data.sevenDaySpend) * 100)}%`
                            : "")
                        : "—"}
                    </dd>
                  </div>
                );
              })}
              <div>
                <dt>Total · last 7 complete UTC days</dt>
                <dd>{data.sevenDaySpend == null ? "Unavailable" : money(data.sevenDaySpend)}</dd>
              </div>
            </dl>
          </>
        )
      )}
      <details>
        <summary>Model a scenario</summary>
        <p className="hint">Local estimates only. Twilio balance and spend stay read-only.</p>
        <label>
          <input
            type="checkbox"
            checked={scenario}
            onChange={(e) => setScenario(e.target.checked)}
          />
          Use scenario pace
        </label>
        <Field
          label="Scenario cost per minute"
          type="number"
          min={0}
          step="0.001"
          value={rate}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0)
              void dispatch({ type: "preferences", patch: { scenarioRate: n } });
          }}
        />
        <Field
          label="Scenario minutes per dial"
          type="number"
          min={0}
          step="0.1"
          value={minutes}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0)
              void dispatch({ type: "preferences", patch: { scenarioMinutes: n } });
          }}
        />
      </details>
    </Panel>
  );
}
