import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";

/** Count of inbound calls that were never answered and not yet reviewed. */
export function useMissedCallCount() {
  const { workspace } = useWorkspace();
  const { data } = useQuery({
    queryKey: ["missed-calls", workspace?.id],
    enabled: !!workspace,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("dial_call_logs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace!.id)
        .eq("direction", "inbound")
        .eq("outcome", "no_answer")
        .eq("missed_call_acknowledged", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}
