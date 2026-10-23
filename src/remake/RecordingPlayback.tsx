import { useEffect, useRef, useState } from "react";
import { useRuntime } from "./runtime";
/** Recording media is fetched only after the user explicitly asks to listen. */
export function RecordingPlayback({ id }: { id: string }) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const runtime = useRuntime();
  const [src, setSrc] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );
  if (!runtime.recordings?.availableIds.includes(id)) return null;
  return (
    <div className="recording-playback">
      {src ? (
        <audio aria-label="Call recording" controls preload="metadata" src={src} />
      ) : (
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const blob = await runtime.recordings!.load(id);
              const url = URL.createObjectURL(blob);
              if (alive.current) setSrc(url);
              else URL.revokeObjectURL(url);
            } catch {
              setError("Could not load this recording. Reconnect and try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Loading recording…" : "Load recording"}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
