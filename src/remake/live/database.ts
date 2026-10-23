import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../integrations/supabase/types";
export type CallboardDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      callboard_workspace_state: {
        Row: { workspace_id: string; revision: number; data: Json; updated_at: string };
        Insert: { workspace_id: string; revision?: number; data?: Json; updated_at?: string };
        Update: { revision?: number; data?: Json; updated_at?: string };
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      save_callboard_workspace: {
        Args: {
          p_workspace_id: string;
          p_expected_revision: number;
          p_document: Json;
          p_changes: Json;
        };
        Returns: number;
      };
    };
  };
};
export type CallboardClient = SupabaseClient<CallboardDatabase>;
