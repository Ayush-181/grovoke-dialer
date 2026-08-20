import type { ReactNode } from "react";
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
import { PhoneWidget } from "@/components/PhoneWidget";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/leads", label: "Leads", icon: LayoutList },
  { to: "/sessions", label: "Sessions", icon: ListChecks },
  { to: "/calls", label: "Call Log", icon: PhoneCall },
  { to: "/timezones", label: "Time Zones", icon: Clock },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { workspace } = useWorkspace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex h-12 items-center gap-6 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground">
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
                    "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-surface-raised text-primary"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
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
