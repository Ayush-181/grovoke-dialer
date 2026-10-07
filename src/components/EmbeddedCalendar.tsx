import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "callboard.embeddedCalendarId";
type Mode = "WEEK" | "MONTH" | "AGENDA";

/** Shows the user's Google Calendar inside the page. Google shows private events
 *  only when this browser is signed in to the matching Google account. */
export function EmbeddedCalendar({ connectedEmail }: { connectedEmail: string | null }) {
  const [calendarId, setCalendarId] = useState("");
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("WEEK");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setCalendarId(saved);
      setDraft(saved);
    }
  }, []);

  useEffect(() => {
    if (connectedEmail && !calendarId) {
      setCalendarId(connectedEmail);
      setDraft(connectedEmail);
    }
  }, [connectedEmail, calendarId]);

  const save = () => {
    const value = draft.trim();
    setCalendarId(value);
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  const src = calendarId
    ? `https://calendar.google.com/calendar/embed?${new URLSearchParams({
        src: calendarId,
        ctz: "Asia/Kolkata",
        mode,
        showPrint: "0",
        showTitle: "0",
      }).toString()}`
    : "";

  return (
    <div className="panel mb-5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">My calendar</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
            {(["WEEK", "MONTH", "AGENDA"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  mode === m ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {m === "WEEK" ? "Week" : m === "MONTH" ? "Month" : "Agenda"}
              </button>
            ))}
          </div>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="you@gmail.com"
            className="h-8 w-56 text-xs"
            aria-label="Google Calendar email or ID"
          />
          <Button size="sm" variant="outline" onClick={save}>
            Show
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </Button>
        </div>
      </div>
      {src ? (
        <>
          <iframe
            key={src}
            src={src}
            title="Google Calendar"
            className="h-[600px] w-full rounded-lg border border-border bg-background"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Times shown in IST. If the calendar looks empty, sign in to this Google account in your
            browser.
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Enter your Google Calendar email above (or connect Google Calendar) to see it here.
        </p>
      )}
    </div>
  );
}
