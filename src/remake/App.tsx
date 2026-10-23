import { timeAt } from "./format";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Headphones,
  LayoutDashboard,
  ListFilter,
  ListOrdered,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Phone,
  PhoneOff,
  Settings2,
  Sun,
  Users,
  X,
  FileText,
  Upload,
  RotateCcw,
} from "lucide-react";
import {
  initialState as createInitialState,
  emptyLead,
  isDirty,
  reducer,
  type State,
  type Action,
} from "./model";
import { demoRuntime, type RuntimeServices } from "./runtime";
import { RuntimeProvider } from "./RuntimeProvider";
import { initializeLocalWorkspace, serializeWorkspace, LOCAL_STATE_KEY } from "./state-store";
import { validateDraft } from "./domain";
import { ConfigurationPage } from "./Configuration";
import { DataToolsPage } from "./DataTools";
import { zones } from "./model";
import { Modal } from "./components";
import {
  Overview,
  LeadsPage,
  SessionsPage,
  ActivityPage,
  TimezonesPage,
  SettingsPage,
  FollowUpsPage,
} from "./pages";
import { Dialer } from "./Dialer";
import { BookingsPage } from "./Bookings";
import { formatDuration } from "../lib/outcomes";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: Users },
  { id: "dialer", label: "Dialer", icon: Phone },
  { id: "sessions", label: "Sessions", icon: ListOrdered },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "bookings", label: "Bookings", icon: CalendarDays },
  { id: "timezones", label: "Time Zones", icon: Clock3 },
  { id: "followups", label: "Follow-ups", icon: RotateCcw },
  { id: "configuration", label: "Configuration", icon: FileText },
  { id: "data", label: "Data", icon: Upload },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
export type Page = (typeof navigation)[number]["id"];
function pageFromHash(): Page {
  const value = location.hash.slice(1);
  return navigation.find((item) => item.id === value)?.id ?? "overview";
}
export function App({
  initialState: providedState,
  runtime = demoRuntime,
}: { initialState?: State; runtime?: RuntimeServices } = {}) {
  const [loaded] = useState(() =>
    runtime.mode === "live"
      ? {
          state: providedState ?? {
            ...createInitialState(),
            leads: [],
            logs: [],
            bookings: [],
            sessions: [],
            queueIds: [],
            draft: emptyLead(),
            selectedId: "",
          },
          error: "",
        }
      : (() => {
          try {
            return initializeLocalWorkspace(localStorage);
          } catch {
            return {
              state: createInitialState(),
              error: "Browser storage is unavailable. Export a JSON backup before closing.",
            };
          }
        })(),
  );
  const [state, setState] = useState<State>(loaded.state);
  const stateRef = useRef(state);
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const [storageError, setStorageError] = useState(loaded.error);
  const storageEnabled = useRef(!loaded.error);
  const [operationError, setOperationError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const busyRef = useRef(false);
  const apply = useCallback((action: Action) => {
    const current = stateRef.current;
    const next = reducer(current, action);
    stateRef.current = next;
    setState(next);
    return next !== current;
  }, []);
  const dispatch = useCallback(
    async (action: Action): Promise<boolean> => {
      const service = runtimeRef.current;
      const localOnly = [
        "edit",
        "select",
        "discard",
        "queue",
        "tick",
        "answer",
        "providerTime",
      ].includes(action.type);
      const clockAction = ["tick", "answer", "providerTime"].includes(action.type);
      if (busyRef.current && !clockAction) {
        setOperationError("Wait for the current operation to finish before making another change.");
        return false;
      }
      const before = stateRef.current;
      if (action.type === "save") {
        const error = validateDraft(
          before.draft,
          Date.now(),
          before.leads.find((lead) => lead.id === before.selectedId),
        );
        if (error) {
          setOperationError(error);
          return false;
        }
      }
      const after = reducer(before, action);
      if (after === before) return false;
      if (service.mode === "demo" || localOnly) {
        apply(action);
        if (action.type === "restoreData") {
          storageEnabled.current = true;
          setStorageError("");
        }
        return true;
      }
      if (!service.execute) {
        setOperationError("Workspace persistence is unavailable. Reconnect before saving.");
        return false;
      }
      busyRef.current = true;
      setSyncBusy(true);
      setOperationError("");
      try {
        await service.execute(action, before, after);
        apply(action);
        return true;
      } catch (error) {
        setOperationError(
          error instanceof Error
            ? error.message
            : "The operation did not complete. Your edits have been kept.",
        );
        return false;
      } finally {
        busyRef.current = false;
        setSyncBusy(false);
      }
    },
    [apply],
  );
  useEffect(() => {
    if (runtime.mode !== "demo" || !storageEnabled.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_STATE_KEY, serializeWorkspace(stateRef.current));
        setStorageError("");
      } catch {
        setStorageError(
          "Changes are in memory but could not be saved in this browser. Export a JSON backup from Data before closing.",
        );
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [state, runtime.mode]);
  const seedRef = useRef(providedState);
  useEffect(() => {
    if (runtime.mode !== "live" || !providedState || providedState === seedRef.current || syncBusy)
      return;
    if (stateRef.current.call?.active || isDirty(stateRef.current)) {
      setOperationError(
        "Updated workspace data is available. Finish the call and save or discard edits before refreshing.",
      );
      return;
    }
    seedRef.current = providedState;
    stateRef.current = providedState;
    setState(providedState);
  }, [providedState, runtime.mode, syncBusy, state.call?.active, state.draft]);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem("callboard-remake-theme");
      if (stored) return stored === "night" ? "night" : "day";
    } catch {
      /* Use the current document preference. */
    }
    return document.documentElement.dataset["theme"] === "night" ||
      matchMedia("(prefers-color-scheme: dark)").matches
      ? "night"
      : "day";
  });
  const [now, setNow] = useState(() => new Date());
  const [menu, setMenu] = useState(false);
  const [leadsView, setLeadsView] = useState<"all" | "callbacks">("all");
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("callboard-remake-navigation") !== "expanded";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("callboard-remake-navigation", collapsed ? "compact" : "expanded");
    } catch {
      /* Navigation remains usable without storage. */
    }
  }, [collapsed]);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [navigationError, setNavigationError] = useState("");
  const dirty = isDirty(state);
  function guarded(action: () => void) {
    if (busyRef.current) {
      setOperationError("Wait for the current operation to finish.");
      return;
    }
    if (dirty) setPending(() => action);
    else action();
  }
  function navigate(next: Page, view?: "all" | "callbacks") {
    if (next === page && !view) {
      setMenu(false);
      return;
    }
    guarded(() => {
      if (view) setLeadsView(view);
      location.hash = next;
      setPage(next);
      setMenu(false);
      setNotice("");
    });
  }
  function openLead(id: string) {
    if (state.call?.active && id !== state.selectedId) {
      setNotice("End the current call before changing leads.");
      return;
    }
    guarded(() => {
      dispatch({ type: "select", id });
      location.hash = "dialer";
      setPage("dialer");
    });
  }
  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "night" ? "#0c111b" : "#f5f7fa");
    try {
      localStorage.setItem("callboard-remake-theme", theme);
    } catch {
      /* Theme still works without storage. */
    }
  }, [theme]);
  useEffect(() => {
    try {
      if (runtimeRef.current.mode === "demo" && !localStorage.getItem(LOCAL_STATE_KEY))
        dispatch({
          type: "recording",
          enabled: localStorage.getItem("callboard-remake-recording") === "true",
        });
    } catch {
      /* Session preference remains usable. */
    }
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [dispatch]);
  useEffect(() => {
    if (!state.call?.active) return;
    if (runtimeRef.current.mode === "live") return;
    const timer = setInterval(() => {
      void dispatch({ type: "tick", now: Date.now() });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.call?.active, dispatch]);
  const handledProviderEnd = useRef<string | null>(null);
  useEffect(() => {
    if (runtime.mode !== "live" || !stateRef.current.call?.active) return;
    const snapshot = runtime.voice?.snapshot;
    if (!snapshot || (snapshot.phone && snapshot.phone !== stateRef.current.call.phone)) return;
    if (snapshot.phase === "live" && stateRef.current.call.phase === "connecting")
      void dispatch({ type: "answer", id: stateRef.current.call.id });
    if (snapshot.phase === "live")
      void dispatch({
        type: "providerTime",
        seconds: snapshot.seconds,
        ...(snapshot.talkSeconds !== undefined ? { talkSeconds: snapshot.talkSeconds } : {}),
        ...(snapshot.heldSeconds !== undefined ? { heldSeconds: snapshot.heldSeconds } : {}),
      });
    if (
      snapshot.phase === "ended" &&
      !busyRef.current &&
      handledProviderEnd.current !== stateRef.current.call.id
    ) {
      handledProviderEnd.current = stateRef.current.call.id;
      void dispatch({ type: "end", at: new Date().toISOString() });
    }
  }, [
    runtime.mode,
    runtime.voice?.snapshot,
    state.call?.id,
    state.call?.active,
    syncBusy,
    dispatch,
  ]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = () => {
      const next = pageFromHash();
      if (next === page) return;
      if (busyRef.current) {
        history.replaceState(null, "", `#${page}`);
        return;
      }
      if (dirty) {
        history.replaceState(null, "", `#${page}`);
        setPending(() => () => {
          location.hash = next;
          setPage(next);
        });
      } else setPage(next);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || state.call?.active) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("hashchange", handler);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, page, state.call?.active]);
  const common = { state, dispatch, notify: setNotice, openLead };
  return (
    <RuntimeProvider runtime={{ ...runtime, pending: syncBusy }}>
      <div className={`workspace ${collapsed ? "nav-collapsed" : ""}`}>
        <a
          href="#main-content"
          className="skip-link"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          Skip to content
        </a>
        <aside className={`sidebar ${menu ? "is-open" : ""}`}>
          <a
            className="brand"
            aria-label="Call Board overview"
            title={collapsed ? "Call Board" : undefined}
            href="#overview"
            onClick={(event) => {
              if (!(event.ctrlKey || event.metaKey || event.shiftKey)) {
                event.preventDefault();
                navigate("overview");
              }
            }}
          >
            <span className="brand-mark">
              <BarChart3 aria-hidden="true" size={22} />
            </span>
            <span translate="no">
              CALL BOARD<small>A better rhythm for sales</small>
            </span>
          </a>
          <div className="sidebar-label">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {navigation.map(({ id, label, icon: Icon }) => (
              <a
                href={`#${id}`}
                aria-label={label}
                title={collapsed ? label : undefined}
                key={id}
                className={page === id ? "active" : ""}
                aria-current={page === id ? "page" : undefined}
                onClick={(event) => {
                  if (!(event.ctrlKey || event.metaKey || event.shiftKey)) {
                    event.preventDefault();
                    navigate(id);
                  }
                }}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{label}</span>
                <span className="nav-tooltip" aria-hidden="true">
                  {label}
                </span>
                {id === "leads" && <small>{state.leads.length}</small>}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sample-badge">
              <span className="status-dot" />
              {runtime.mode === "live" ? "YOUR WORKSPACE" : "LOCAL WORKSPACE"}
            </div>
            <p>
              {runtime.mode === "live" ? (
                "Connected to your Grovoke workspace."
              ) : (
                <>
                  Saved in this browser.
                  <br />
                  Calls and invitations are simulated.
                </>
              )}
            </p>
            <div className="profile">
              <span className="avatar">A</span>
              <div>
                <strong>{state.preferences.displayName}</strong>
                <small>{state.preferences.workspaceName}</small>
              </div>
            </div>
          </div>
        </aside>
        {menu && (
          <button
            className="menu-scrim"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <div className="workspace-body">
          <main id="main-content" tabIndex={-1} className={`content page-${page}`}>
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="icon-button mobile-menu"
                  aria-label="Open navigation"
                  onClick={() => setMenu(true)}
                >
                  <Menu aria-hidden="true" size={20} />
                </button>
                <button
                  className="icon-button desktop-menu"
                  aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                  aria-expanded={!collapsed}
                  onClick={() => setCollapsed((value) => !value)}
                >
                  {collapsed ? (
                    <PanelLeftOpen aria-hidden="true" size={20} />
                  ) : (
                    <PanelLeftClose aria-hidden="true" size={20} />
                  )}
                </button>
                <span>Workspace</span>
                <ChevronRight aria-hidden="true" size={14} />
                <h1 className="workspace-title">{navigation.find((n) => n.id === page)?.label}</h1>
              </div>
              <div className="topbar-tools">
                <span className="preview-chip">
                  {runtime.mode === "live" ? "Workspace" : "Offline copy"}
                </span>
                <div className="header-clock">
                  <small>YOUR TIME · IST</small>
                  <strong>{timeAt(now, "Asia/Kolkata")}</strong>
                </div>
                <div className="header-clock">
                  <label className="header-zone">
                    <span className="sr-only">Lead timezone</span>
                    <select
                      name="header-lead-zone"
                      value={state.draft.zone}
                      onChange={(e) => dispatch({ type: "edit", patch: { zone: e.target.value } })}
                    >
                      {zones.map((zone) => (
                        <option key={zone.value} value={zone.value}>
                          {zone.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <strong>{timeAt(now, state.draft.zone)}</strong>
                </div>
                <button
                  className="theme-toggle"
                  aria-label={`Switch to ${theme === "day" ? "night" : "day"} mode`}
                  aria-pressed={theme === "night"}
                  onClick={() => setTheme((t) => (t === "day" ? "night" : "day"))}
                >
                  <Sun aria-hidden="true" size={16} />
                  <span className="theme-track">
                    <span />
                  </span>
                  <Moon aria-hidden="true" size={16} />
                  <span className="sr-only">Day / Night</span>
                </button>
                <span className="avatar small">A</span>
              </div>
            </header>
            {(syncBusy || operationError || storageError) && (
              <div
                className={`workspace-status ${operationError || storageError ? "has-error" : ""}`}
                role={operationError || storageError ? "alert" : "status"}
              >
                <span>{syncBusy ? "Saving / connecting…" : operationError || storageError}</span>
                {!syncBusy && operationError && runtime.refresh && (
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        if (stateRef.current.call?.active || isDirty(stateRef.current)) {
                          setOperationError(
                            "Finish the call and save or discard edits before refreshing.",
                          );
                          return;
                        }
                        await runtime.refresh?.();
                        setOperationError("");
                      } catch (error) {
                        setOperationError(
                          error instanceof Error ? error.message : "Refresh failed.",
                        );
                      }
                    }}
                  >
                    Refresh workspace
                  </button>
                )}
                {!syncBusy && operationError && (
                  <button
                    className="icon-button"
                    aria-label="Dismiss error"
                    onClick={() => setOperationError("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
            {page === "overview" && <Overview {...common} navigate={navigate} />}
            {page === "leads" && (
              <LeadsPage {...common} view={leadsView} onViewChange={setLeadsView} />
            )}
            {page === "dialer" && <Dialer {...common} guarded={guarded} now={now} />}
            {page === "sessions" && (
              <SessionsPage
                {...common}
                now={now}
                startQueue={(id) =>
                  guarded(() => {
                    void dispatch({ type: "startSession", id, now: Date.now() }).then((saved) => {
                      if (saved) {
                        location.hash = "dialer";
                        setPage("dialer");
                      }
                    });
                  })
                }
              />
            )}
            {page === "activity" && <ActivityPage {...common} />}
            {page === "bookings" && <BookingsPage {...common} />}
            {page === "timezones" && <TimezonesPage {...common} now={now} />}
            {page === "followups" && <FollowUpsPage {...common} now={now} />}
            {page === "configuration" && <ConfigurationPage {...common} />}
            {page === "data" && <DataToolsPage {...common} />}
            {page === "settings" && <SettingsPage {...common} theme={theme} setTheme={setTheme} />}
          </main>
          {state.call?.active && page !== "dialer" && (
            <div className="active-call-bar">
              <div>
                <span className="status-dot" />
                <Headphones aria-hidden="true" size={18} />
                <strong>{state.draft.business}</strong>
                <span className="mono">{formatDuration(state.call.seconds)}</span>
                <small>{state.call.recording ? "Recording on" : "Recording off"}</small>
              </div>
              <div>
                <button className="button" onClick={() => navigate("dialer")}>
                  <Phone aria-hidden="true" size={16} />
                  Return to call
                </button>
                <button
                  className="button danger"
                  onClick={() => dispatch({ type: "end", at: new Date().toISOString() })}
                >
                  <PhoneOff aria-hidden="true" size={16} />
                  End call
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="toast-region" aria-live="polite" role="status">
          {notice && (
            <div className="toast">
              <Check aria-hidden="true" size={18} />
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          )}
        </div>
        <Modal
          open={Boolean(pending)}
          onClose={() => {
            setPending(null);
            setNavigationError("");
          }}
          title="Keep your changes?"
          description="You have unsaved details for this lead. Save them before moving, or discard the edits."
        >
          <p className="error" role="alert">
            {navigationError}
          </p>
          <div className="modal-actions">
            <button
              className="button"
              onClick={() => {
                setPending(null);
                setNavigationError("");
              }}
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Keep editing
            </button>
            <button
              className="button"
              onClick={() => {
                dispatch({ type: "discard" });
                pending?.();
                setPending(null);
                setNavigationError("");
              }}
            >
              Discard & continue
            </button>
            <button
              className="button primary"
              disabled={state.call?.active || syncBusy}
              onClick={async () => {
                const error = validateDraft(
                  state.draft,
                  Date.now(),
                  state.leads.find((lead) => lead.id === state.selectedId),
                );
                if (error) {
                  setNavigationError(error);
                  return;
                }
                if (!(await dispatch({ type: "save" }))) {
                  setNavigationError("Could not save. Check the workspace message and try again.");
                  return;
                }
                pending?.();
                setPending(null);
                setNavigationError("");
              }}
            >
              Save & continue
            </button>
          </div>
          {state.call?.active && (
            <p className="hint">
              End the call before saving. You can keep editing or discard changes.
            </p>
          )}
        </Modal>
      </div>
    </RuntimeProvider>
  );
}
