import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Twilio recording URLs need HTTP Basic auth, so we stream them through our own
 * authenticated proxy route and hand the <audio> tag a blob URL.
 */
export function RecordingPlayer({ callLogId }: { callLogId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      setError(null);
      setSrc(null);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Sign in again to play this recording.");
        return;
      }
      const res = await fetch(`/api/recordings/${callLogId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (!cancelled) setError(`Could not load recording (${res.status})`);
        return;
      }
      const blob = await res.blob();
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Could not load recording");
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [callLogId]);

  if (error) return <p className="mt-2 text-[11px] text-destructive">{error}</p>;
  if (!src) return <p className="mt-2 text-[11px] text-muted-foreground">Loading recording…</p>;
  return <audio controls src={src} className="mt-2 w-full" />;
}
