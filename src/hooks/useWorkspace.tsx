import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Workspace = { id: string; name: string; owner_id: string };

type WorkspaceState = {
  workspace: Workspace | null;
  loading: boolean;
  refresh: () => void;
};

const Ctx = createContext<WorkspaceState>({ workspace: null, loading: true, refresh: () => {} });

async function loadOrCreateWorkspace(userId: string, email: string | null): Promise<Workspace> {
  const { data: memberships, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name, owner_id)")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw error;

  const existing = memberships?.[0]?.workspaces as Workspace | undefined;
  if (existing) return existing;

  const name = email ? `${email.split("@")[0]}'s workspace` : "My workspace";
  const { data: created, error: createErr } = await supabase
    .from("workspaces")
    .insert({ name, owner_id: userId })
    .select("id, name, owner_id")
    .single();
  if (createErr) throw createErr;

  await supabase
    .from("workspace_members")
    .insert({ workspace_id: created.id, user_id: userId, role: "owner" });
  await supabase.from("profiles").upsert({ id: userId, email });
  await supabase.from("user_preferences").upsert({ user_id: userId }, { onConflict: "user_id" });
  return created as Workspace;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, initialized } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace", user?.id],
    enabled: initialized && !!user,
    queryFn: () => loadOrCreateWorkspace(user!.id, user!.email ?? null),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (error) {
      toast.error(
        `Workspace failed to load: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }, [error]);

  return (
    <Ctx.Provider
      value={{
        workspace: data ?? null,
        loading: !initialized || isLoading,
        refresh: () => qc.invalidateQueries({ queryKey: ["workspace"] }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace() {
  return useContext(Ctx);
}
