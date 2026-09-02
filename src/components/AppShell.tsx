import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Clock,
  LayoutList,
  ListChecks,
  PhoneCall,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useMissedCallCount } from "@/hooks/useMissedCalls";
import { PhoneWidget } from "@/components/PhoneWidget";
import { HOME_ZONE, formatTimeInZone, zoneDef } from "@/lib/timezones";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/leads", label: "Leads", icon: LayoutList },
  { to: "/sessions", label: "Sessions", icon: ListChecks },
  { to: "/calls", label: "Call Log", icon: PhoneCall },
  { to: "/timezones", label: "Time Zones", icon: Clock },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const HEADER_CLOCKS = [HOME_ZONE, "America/New_York", "America/Los_Angeles"];

function HeaderClocks() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hidden items-center gap-3 rounded-full border border-border bg-surface px-3 py-1 xl:flex">
      {HEADER_CLOCKS.map((z) => (
        <div key={z} className="flex items-baseline gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            {zoneDef(z).short}
          </span>
          <span className="mono text-xs font-semibold">{formatTimeInZone(now, z)}</span>
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { workspace } = useWorkspace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const missedCalls = useMissedCallCount();


  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PhoneCall className="h-3.5 w-3.5" />
            </span>
            <span className="mono text-sm font-semibold tracking-tight">CALL BOARD</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                  {item.to === "/calls" && missedCalls > 0 && (
                    <span
                      className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
                      aria-label={`${missedCalls} missed calls`}
                    >
                      {missedCalls > 99 ? "99+" : missedCalls}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <HeaderClocks />
            <span className="hidden text-xs text-muted-foreground md:inline">
              {workspace?.name}
            </span>
            <span className="mono hidden text-xs text-muted-foreground lg:inline">
              {user?.email}
            </span>

            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-5">{children}</main>
      <PhoneWidget />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
