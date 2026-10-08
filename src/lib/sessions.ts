import { supabase } from "@/integrations/supabase/client";

export type LeadFilters = {
  search?: string;
  status?: string;
  outcome?: string;
  state?: string;
  city?: string;
  neverCalled?: boolean;
};

/** Applies lead filters to a supabase query builder. */
export function applyLeadFilters<T>(query: T, filters: LeadFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    q = q.or(`business_name.ilike.%${s}%,phone.ilike.%${s}%,city.ilike.%${s}%`);
  }
  if (filters.status) q = q.eq("status", filters.status);
  // Outcome is a nullable enum: blank outcomes are stored as NULL.
  if (filters.neverCalled) q = q.is("outcome", null);
  else if (filters.outcome) q = q.eq("outcome", filters.outcome);
  if (filters.state) q = q.ilike("state", filters.state);
  if (filters.city) q = q.ilike("city", filters.city);
  return q as T;
}

/**
 * Creates a calling session from a lead filter, de-duplicating the queue by
 * normalized phone number so the same business is never dialed twice.
 */
export async function createSessionFromFilters(
  workspaceId: string,
  userId: string,
  name: string,
  filters: LeadFilters,
  limit = 500,
): Promise<{ sessionId: string; queued: number }> {
  const base = supabase
    .from("leads")
    .select("id, phone_normalized")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(limit);

  const { data: leads, error } = await applyLeadFilters(base, filters);
  if (error) throw error;

  const seen = new Set<string>();
  const unique = (leads ?? []).filter((l) => {
    if (seen.has(l.phone_normalized)) return false;
    seen.add(l.phone_normalized);
    return true;
  });
  if (unique.length === 0) throw new Error("No leads match that filter");

  const { data: session, error: sErr } = await supabase
    .from("calling_sessions")
    .insert({
      workspace_id: workspaceId,
      name,
      created_by: userId,
      filters_json: filters as never,
      total_leads: unique.length,
    })
    .select("id")
    .single();
  if (sErr) throw sErr;

  const rows = unique.map((l, i) => ({
    session_id: session.id,
    workspace_id: workspaceId,
    lead_id: l.id,
    phone_normalized: l.phone_normalized,
    queue_position: i,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error: qErr } = await supabase.from("session_leads").insert(rows.slice(i, i + 500));
    if (qErr) throw qErr;
  }

  return { sessionId: session.id, queued: unique.length };
}
