import { useCallback, useEffect, useRef, useState } from "react";
import {
  readCalendarSession,
  GOOGLE_CALENDAR_SESSION_PREFIX,
  type SavedConnection,
} from "@/lib/calendar-session";
import { useAuth } from "@/hooks/useAuth";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/google-calendar";

type TokenResponse = { access_token: string; expires_in: number; scope: string; error?: string };
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: () => void;
      }) => { requestAccessToken: (options: { prompt: string }) => void };
      hasGrantedAllScopes: (response: TokenResponse, ...scopes: string[]) => boolean;
      revoke: (token: string, callback: () => void) => void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let scriptPromise: Promise<void> | undefined;
function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("Google connection took too long. Reload and try again."));
    }, 15_000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("Google could not load. Check your connection and reload."));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}

export function useGoogleCalendar() {
  const { user } = useAuth();
  const userId = user?.id;
  const sessionKey = userId ? `${GOOGLE_CALENDAR_SESSION_PREFIX}${userId}` : null;
  const forgetSession = useCallback(() => {
    if (sessionKey) {
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    }
  }, [sessionKey]);
  const clientId = import.meta.env["VITE_GOOGLE_CALENDAR_CLIENT_ID"] as string | undefined;
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const token = useRef<string | null>(null);
  const generation = useRef(0);
  const client = useRef<ReturnType<GoogleIdentity["accounts"]["oauth2"]["initTokenClient"]> | null>(
    null,
  );

  useEffect(() => {
    token.current = null;
    setEmail(null);
    setExpiresAt(0);
    setReady(false);
    if (!clientId || !sessionKey) return;
    let alive = true;
    let saved: SavedConnection | null = null;
    try {
      saved = readCalendarSession(sessionStorage, sessionKey);
    } catch {
      /* Connect still works without storage. */
    }
    if (saved) {
      token.current = saved.token;
      setEmail(saved.email);
      setExpiresAt(saved.expiresAt);
    }
    void loadGoogleIdentity()
      .then(() => {
        if (!alive || !window.google) return;
        client.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_CALENDAR_SCOPES,
          error_callback: () => {
            if (alive) {
              setConnecting(false);
              setError("Google connection was closed. Try again and allow the popup.");
            }
          },
          callback: (response) => {
            if (!alive) return;
            const current = ++generation.current;
            if (
              response.error ||
              !window.google?.accounts.oauth2.hasGrantedAllScopes(
                response,
                ...GOOGLE_CALENDAR_SCOPES.split(" "),
              )
            ) {
              setConnecting(false);
              setError("Allow Calendar access to check availability and send invitations.");
              return;
            }
            void fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
              headers: { Authorization: `Bearer ${response.access_token}` },
              signal: AbortSignal.timeout(15_000),
            })
              .then(async (r) => {
                if (!r.ok) throw new Error("Could not verify the connected Google account.");
                const info = (await r.json()) as { email?: string };
                if (!info.email) throw new Error("Google did not return an account email.");
                if (!alive || generation.current !== current) return;
                token.current = response.access_token;
                setEmail(info.email);
                const expiry = Date.now() + response.expires_in * 1000 - 30_000;
                setExpiresAt(expiry);
                try {
                  sessionStorage.setItem(
                    sessionKey,
                    JSON.stringify({
                      token: response.access_token,
                      email: info.email,
                      expiresAt: expiry,
                    }),
                  );
                } catch {
                  /* Current connection remains usable without persistence. */
                }
                setError(null);
              })
              .catch((e: unknown) => {
                if (alive && generation.current === current)
                  setError(e instanceof Error ? e.message : "Google connection failed.");
              })
              .finally(() => {
                if (alive && generation.current === current) setConnecting(false);
              });
          },
        });
        setReady(true);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Google could not load.");
      });
    return () => {
      alive = false;
      token.current = null;
      client.current = null;
    };
  }, [clientId, sessionKey]);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => {
        token.current = null;
        forgetSession();
        setEmail(null);
        setExpiresAt(0);
        setError("Google connection expired. Reconnect to continue booking.");
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, forgetSession]);

  const getToken = useCallback(() => {
    if (!token.current || Date.now() >= expiresAt)
      throw new Error("Connect Google Calendar before sending invitations.");
    return token.current;
  }, [expiresAt]);

  return {
    configured: !!clientId,
    ready,
    connecting,
    email,
    error,
    getToken,
    connect: () => {
      setError(null);
      setConnecting(true);
      client.current?.requestAccessToken({ prompt: "select_account" });
    },
    disconnect: () => {
      generation.current++;
      if (token.current) window.google?.accounts.oauth2.revoke(token.current, () => {});
      token.current = null;
      forgetSession();
      setEmail(null);
      setExpiresAt(0);
      setError(null);
    },
  };
}
