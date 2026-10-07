export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          add_meet: boolean
          attendees: string[]
          created_at: string
          created_by: string
          ends_at: string
          google_account_email: string
          google_event_id: string
          google_event_url: string | null
          id: string
          lead_id: string | null
          lead_timezone: string
          location: string
          meet_url: string | null
          notes: string
          starts_at: string
          status: string
          title: string
          workspace_id: string
        }
        Insert: {
          add_meet?: boolean
          attendees?: string[]
          created_at?: string
          created_by: string
          ends_at: string
          google_account_email: string
          google_event_id: string
          google_event_url?: string | null
          id?: string
          lead_id?: string | null
          lead_timezone: string
          location?: string
          meet_url?: string | null
          notes?: string
          starts_at: string
          status?: string
          title: string
          workspace_id: string
        }
        Update: {
          add_meet?: boolean
          attendees?: string[]
          created_at?: string
          created_by?: string
          ends_at?: string
          google_account_email?: string
          google_event_id?: string
          google_event_url?: string | null
          id?: string
          lead_id?: string | null
          lead_timezone?: string
          location?: string
          meet_url?: string | null
          notes?: string
          starts_at?: string
          status?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calling_sessions: {
        Row: {
          completed_leads: number
          created_at: string
          created_by: string | null
          filters_json: Json
          id: string
          name: string
          status: Database["public"]["Enums"]["session_status"]
          total_leads: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_leads?: number
          created_at?: string
          created_by?: string | null
          filters_json?: Json
          id?: string
          name: string
          status?: Database["public"]["Enums"]["session_status"]
          total_leads?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_leads?: number
          created_at?: string
          created_by?: string | null
          filters_json?: Json
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["session_status"]
          total_leads?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calling_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dial_call_logs: {
        Row: {
          appointment_offered: boolean
          business_name: string | null
          call_sid: string | null
          called_at: string
          created_at: string
          direction: string
          duration_seconds: number
          id: string
          lead_id: string | null
          missed_call_acknowledged: boolean
          notes: string | null
          outcome: Database["public"]["Enums"]["lead_outcome"] | null
          phone: string
          recording_url: string | null
          session_id: string | null
          transcript: string | null
          triage_held: boolean
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          appointment_offered?: boolean
          business_name?: string | null
          call_sid?: string | null
          called_at?: string
          created_at?: string
          direction?: string
          duration_seconds?: number
          id?: string
          lead_id?: string | null
          missed_call_acknowledged?: boolean
          notes?: string | null
          outcome?: Database["public"]["Enums"]["lead_outcome"] | null
          phone: string
          recording_url?: string | null
          session_id?: string | null
          transcript?: string | null
          triage_held?: boolean
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          appointment_offered?: boolean
          business_name?: string | null
          call_sid?: string | null
          called_at?: string
          created_at?: string
          direction?: string
          duration_seconds?: number
          id?: string
          lead_id?: string | null
          missed_call_acknowledged?: boolean
          notes?: string | null
          outcome?: Database["public"]["Enums"]["lead_outcome"] | null
          phone?: string
          recording_url?: string | null
          session_id?: string | null
          transcript?: string | null
          triage_held?: boolean
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dial_call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dial_call_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "calling_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dial_call_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          business_name: string
          call_count: number
          city: string | null
          created_at: string
          email: string | null
          id: string
          last_called_at: string | null
          metadata_json: Json
          notes: string | null
          outcome: Database["public"]["Enums"]["lead_outcome"] | null
          owner_name: string | null
          phone: string
          phone_normalized: string
          state: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          website: string | null
          workspace_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          call_count?: number
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_called_at?: string | null
          metadata_json?: Json
          notes?: string | null
          outcome?: Database["public"]["Enums"]["lead_outcome"] | null
          owner_name?: string | null
          phone: string
          phone_normalized: string
          state?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          website?: string | null
          workspace_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          call_count?: number
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_called_at?: string | null
          metadata_json?: Json
          notes?: string | null
          outcome?: Database["public"]["Enums"]["lead_outcome"] | null
          owner_name?: string | null
          phone?: string
          phone_normalized?: string
          state?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          website?: string | null
          workspace_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_filters: {
        Row: {
          created_at: string
          filters_json: Json
          id: string
          name: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          filters_json?: Json
          id?: string
          name: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          filters_json?: Json
          id?: string
          name?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_filters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      session_leads: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          outcome: Database["public"]["Enums"]["lead_outcome"] | null
          phone_normalized: string
          queue_position: number
          session_id: string
          status: Database["public"]["Enums"]["session_lead_status"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          outcome?: Database["public"]["Enums"]["lead_outcome"] | null
          phone_normalized: string
          queue_position: number
          session_id: string
          status?: Database["public"]["Enums"]["session_lead_status"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          outcome?: Database["public"]["Enums"]["lead_outcome"] | null
          phone_normalized?: string
          queue_position?: number
          session_id?: string
          status?: Database["public"]["Enums"]["session_lead_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_leads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "calling_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          default_anchor_zone: string
          last_workspace_id: string | null
          mic_device_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_anchor_zone?: string
          last_workspace_id?: string | null
          mic_device_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_anchor_zone?: string
          last_workspace_id?: string | null
          mic_device_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          fallback_phone_number: string | null
          twilio_account_sid: string | null
          twilio_api_key_secret: string | null
          twilio_api_key_sid: string | null
          twilio_auth_token: string | null
          twilio_phone_number: string | null
          twilio_twiml_app_sid: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          fallback_phone_number?: string | null
          twilio_account_sid?: string | null
          twilio_api_key_secret?: string | null
          twilio_api_key_sid?: string | null
          twilio_auth_token?: string | null
          twilio_phone_number?: string | null
          twilio_twiml_app_sid?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          fallback_phone_number?: string | null
          twilio_account_sid?: string | null
          twilio_api_key_secret?: string | null
          twilio_api_key_sid?: string | null
          twilio_auth_token?: string | null
          twilio_phone_number?: string | null
          twilio_twiml_app_sid?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard_stats:
        | { Args: { _workspace_id: string }; Returns: Json }
        | {
            Args: { _month_start?: string; _workspace_id: string }
            Returns: Json
          }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      lead_outcome:
        | "connected_dm"
        | "connected_gk"
        | "connected_other"
        | "voicemail"
        | "busy"
        | "no_answer"
        | "bad_number"
        | "not_interested"
        | "do_not_call"
        | "callback_requested"
        | "appointment_set"
        | "dialed"
      lead_status: "new" | "in_progress" | "completed" | "disqualified"
      session_lead_status: "queued" | "dialing" | "done" | "skipped"
      session_status: "pending" | "active" | "paused" | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lead_outcome: [
        "connected_dm",
        "connected_gk",
        "connected_other",
        "voicemail",
        "busy",
        "no_answer",
        "bad_number",
        "not_interested",
        "do_not_call",
        "callback_requested",
        "appointment_set",
        "dialed",
      ],
      lead_status: ["new", "in_progress", "completed", "disqualified"],
      session_lead_status: ["queued", "dialing", "done", "skipped"],
      session_status: ["pending", "active", "paused", "completed"],
    },
  },
} as const
