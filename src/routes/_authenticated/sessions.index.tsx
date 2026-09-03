import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/sessions/")({
  head: () => ({
    meta: [
      { title: "Calling Sessions — Call Board" },
      {
        name: "description",
        content: "Filtered calling queues with live progress, resume and completion tracking.",
      },
      { property: "og:title", content: "Calling Sessions — Call Board" },
      { property: "og:description", content: "Track and resume your dialing queues." },
    ],
  }),
  component: SessionsPage,
});

function SessionsPage() {
  const { workspace } = useWorkspace();

  const { data: sessions } = useQuery({
    queryKey: ["sessions", workspace?.id],
    enabled: !!workspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calling_sessions")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        title="Calling Sessions"
        subtitle="Each session is a de-duplicated queue built from a lead filter."
        actions={
          <Link to="/leads">
            <Button size="sm">New session from leads</Button>
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(sessions ?? []).length === 0 && (
          <p className="panel p-8 text-center text-xs text-muted-foreground">
            No sessions yet. Filter your leads, then hit “Start session from filter”.
          </p>
        )}
        {(sessions ?? []).map((s) => {
          const pct = s.total_leads ? (s.completed_leads / s.total_leads) * 100 : 0;
          return (
            <Link
              key={s.id}
              to="/sessions/$sessionId"
              params={{ sessionId: s.id }}
              className="panel block p-4 transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="truncate text-sm font-medium">{s.name}</h2>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                    s.status === "active" && "bg-primary/15 text-primary",
                    s.status === "paused" && "bg-warning/15 text-warning",
                    s.status === "completed" && "bg-muted text-muted-foreground",
                    s.status === "pending" && "bg-surface-raised text-muted-foreground",
                  )}
                >
                  {s.status}
                </span>
              </div>
              <div className="mono mt-3 flex items-baseline gap-1 text-2xl font-semibold">
                {s.completed_leads}
                <span className="text-sm text-muted-foreground">/ {s.total_leads}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-surface-raised">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Created {new Date(s.created_at).toLocaleString()}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
