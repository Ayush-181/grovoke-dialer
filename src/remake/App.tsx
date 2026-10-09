import { dateAt, timeAt } from "./format";
import { useEffect, useReducer, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
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
} from "lucide-react";
import { initialState, isDirty, reducer } from "./model";
import { zones } from "./model";
import { Modal } from "./components";
import {
  Overview,
  LeadsPage,
  SessionsPage,
  ActivityPage,
  TimezonesPage,
  SettingsPage,
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
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
export type Page = (typeof navigation)[number]["id"];
const titles: Record<Page, [string, string]> = {
  overview: ["A clear view of your month.", "Your calling activity, conversations & next steps."],
  leads: [
    "Good conversations start here.",
    "Find the right businesses and keep every detail close.",
  ],
  dialer: ["One lead. Your full attention.", "Review, call, capture the outcome — then move on."],
  sessions: [
    "A little structure. More momentum.",
    "Organize your leads into focused calling queues.",
  ],
  activity: ["Every conversation, remembered.", "Review your calls, notes, outcomes & recordings."],
  bookings: ["Make the next step effortless.", "Plan appointments across India and US time zones."],
  timezones: ["Different clocks. Same moment.", "Keep your time and your leads’ time in view."],
  settings: ["Make this workspace yours.", "Your calling preferences, recording & appearance."],
};
function pageFromHash(): Page {
  const value = location.hash.slice(1);
  return navigation.find((item) => item.id === value)?.id ?? "overview";
}
export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset["theme"] === "night" ? "night" : "day",
  );
  const [now, setNow] = useState(() => new Date());
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [navigationError, setNavigationError] = useState("");
  const dirty = isDirty(state);
  function guarded(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }
  function navigate(next: Page) {
    if (next === page) return;
    guarded(() => {
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
      ?.setAttribute("content", theme === "night" ? "#141c19" : "#f7f8f5");
    try {
      localStorage.setItem("callboard-remake-theme", theme);
    } catch {
      /* Theme still works without storage. */
    }
  }, [theme]);
  useEffect(() => {
    try {
      dispatch({
        type: "recording",
        enabled: localStorage.getItem("callboard-remake-recording") === "true",
      });
    } catch {
      /* Session preference remains usable. */
    }
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!state.call?.active) return;
    const timer = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(timer);
  }, [state.call?.active]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = () => {
      const next = pageFromHash();
      if (next === page) return;
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
              {id === "leads" && <small>{state.leads.length}</small>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sample-badge">
            <span className="status-dot" />
            DESIGN PREVIEW
          </div>
          <p>
            Synthetic leads. Simulated calls.
            <br />
            Nothing is sent or dialed.
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
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-tools">
            <span className="preview-chip">Preview</span>
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
        <main id="main-content" tabIndex={-1} className={`content page-${page}`}>
          {page !== "dialer" ? (
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {page === "overview" ? dateAt(now) : navigation.find((n) => n.id === page)?.label}
                </span>
                <h1>{titles[page][0]}</h1>
                <p>{titles[page][1]}</p>
              </div>
              {page === "overview" && (
                <button className="button primary" onClick={() => navigate("dialer")}>
                  <Phone aria-hidden="true" size={16} />
                  Open dialer
                  <ArrowRight aria-hidden="true" size={16} />
                </button>
              )}
            </div>
          ) : (
            <h1 className="sr-only">Calling workspace</h1>
          )}
          {page === "overview" && <Overview {...common} navigate={navigate} />}
          {page === "leads" && <LeadsPage {...common} />}
          {page === "dialer" && <Dialer {...common} guarded={guarded} now={now} />}
          {page === "sessions" && (
            <SessionsPage
              {...common}
              now={now}
              startQueue={(id) =>
                guarded(() => {
                  dispatch({ type: "startSession", id, now: Date.now() });
                  location.hash = "dialer";
                  setPage("dialer");
                })
              }
            />
          )}
          {page === "activity" && <ActivityPage {...common} />}
          {page === "bookings" && <BookingsPage {...common} />}
          {page === "timezones" && <TimezonesPage {...common} now={now} />}
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
            disabled={state.call?.active}
            onClick={() => {
              if (state.draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.draft.email)) {
                setNavigationError(
                  "Enter a valid contact email, or clear the field, before saving.",
                );
                return;
              }
              dispatch({ type: "save" });
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
  );
}
