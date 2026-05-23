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
      admin_action_rate_limit: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          actor_name: string
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          actor_name: string
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_findings: {
        Row: {
          action_ref: string | null
          action_taken: string | null
          detected_at: string
          fingerprint: string
          id: string
          raw_payload: Json | null
          resolved_at: string | null
          run_id: string
          severity: string
          source: string
          summary: string
        }
        Insert: {
          action_ref?: string | null
          action_taken?: string | null
          detected_at?: string
          fingerprint: string
          id?: string
          raw_payload?: Json | null
          resolved_at?: string | null
          run_id: string
          severity: string
          source: string
          summary: string
        }
        Update: {
          action_ref?: string | null
          action_taken?: string | null
          detected_at?: string
          fingerprint?: string
          id?: string
          raw_payload?: Json | null
          resolved_at?: string | null
          run_id?: string
          severity?: string
          source?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_kind: string
          duration_ms: number | null
          findings_count: number
          id: string
          notes: string | null
          ran_at: string
        }
        Insert: {
          agent_kind: string
          duration_ms?: number | null
          findings_count?: number
          id?: string
          notes?: string | null
          ran_at?: string
        }
        Update: {
          agent_kind?: string
          duration_ms?: number | null
          findings_count?: number
          id?: string
          notes?: string | null
          ran_at?: string
        }
        Relationships: []
      }
      course_holes: {
        Row: {
          course_id: string
          hole_number: number
          par: number
          stroke_index: number
        }
        Insert: {
          course_id: string
          hole_number: number
          par: number
          stroke_index: number
        }
        Update: {
          course_id?: string
          hole_number?: number
          par?: number
          stroke_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_holes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          course_handicap: number | null
          flight_number: number | null
          game_id: string
          rejection_reason: string | null
          submitted_at: string | null
          team_number: number | null
          tee_gender: Database["public"]["Enums"]["player_tee_gender"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          course_handicap?: number | null
          flight_number?: number | null
          game_id: string
          rejection_reason?: string | null
          submitted_at?: string | null
          team_number?: number | null
          tee_gender?: Database["public"]["Enums"]["player_tee_gender"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          course_handicap?: number | null
          flight_number?: number | null
          game_id?: string
          rejection_reason?: string | null
          submitted_at?: string | null
          team_number?: number | null
          tee_gender?: Database["public"]["Enums"]["player_tee_gender"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      game_side_winners: {
        Row: {
          category: string
          decided_at: string
          game_id: string
          position: number
          winner_user_id: string | null
        }
        Insert: {
          category: string
          decided_at?: string
          game_id: string
          position: number
          winner_user_id?: string | null
        }
        Update: {
          category?: string
          decided_at?: string
          game_id?: string
          position?: number
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_side_winners_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_side_winners_winner_user_id_fkey"
            columns: ["winner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          course_id: string | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          game_mode: string
          hcp_allowance_pct: number
          id: string
          mode_config: Json
          name: string
          require_peer_approval: boolean
          scheduled_tee_off_at: string | null
          score_visibility: string
          side_ctp_count: number
          side_disabled_categories: string[]
          side_ld_count: number
          side_tournament_enabled: boolean
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          tee_box_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          game_mode: string
          hcp_allowance_pct?: number
          id?: string
          mode_config?: Json
          name: string
          require_peer_approval?: boolean
          scheduled_tee_off_at?: string | null
          score_visibility?: string
          side_ctp_count?: number
          side_disabled_categories?: string[]
          side_ld_count?: number
          side_tournament_enabled?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          tee_box_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          game_mode?: string
          hcp_allowance_pct?: number
          id?: string
          mode_config?: Json
          name?: string
          require_peer_approval?: boolean
          scheduled_tee_off_at?: string | null
          score_visibility?: string
          side_ctp_count?: number
          side_disabled_categories?: string[]
          side_ld_count?: number
          side_tournament_enabled?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          tee_box_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_tee_box_id_fkey"
            columns: ["tee_box_id"]
            isOneToOne: false
            referencedRelation: "tee_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          game_id: string | null
          id: string
          invited_by: string
          opened_at: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          game_id?: string | null
          id?: string
          invited_by: string
          opened_at?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          game_id?: string | null
          id?: string
          invited_by?: string
          opened_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          client_updated_at: string
          entered_by: string
          game_id: string
          hole_number: number
          id: string
          strokes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_updated_at: string
          entered_by: string
          game_id: string
          hole_number: number
          id?: string
          strokes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_updated_at?: string
          entered_by?: string
          game_id?: string
          hole_number?: number
          id?: string
          strokes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tee_boxes: {
        Row: {
          course_id: string
          course_rating_juniors: number | null
          course_rating_ladies: number | null
          course_rating_mens: number | null
          id: string
          length_meters: number | null
          name: string
          par_total_juniors: number | null
          par_total_ladies: number | null
          par_total_mens: number | null
          slope_juniors: number | null
          slope_ladies: number | null
          slope_mens: number | null
        }
        Insert: {
          course_id: string
          course_rating_juniors?: number | null
          course_rating_ladies?: number | null
          course_rating_mens?: number | null
          id?: string
          length_meters?: number | null
          name: string
          par_total_juniors?: number | null
          par_total_ladies?: number | null
          par_total_mens?: number | null
          slope_juniors?: number | null
          slope_ladies?: number | null
          slope_mens?: number | null
        }
        Update: {
          course_id?: string
          course_rating_juniors?: number | null
          course_rating_ladies?: number | null
          course_rating_mens?: number | null
          id?: string
          length_meters?: number | null
          name?: string
          par_total_juniors?: number | null
          par_total_ladies?: number | null
          par_total_mens?: number | null
          slope_juniors?: number | null
          slope_ladies?: number | null
          slope_mens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tee_boxes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          hcp_index: number
          id: string
          is_admin: boolean
          last_seen_at: string | null
          name: string | null
          nickname: string | null
          profile_completed_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          hcp_index?: number
          id: string
          is_admin?: boolean
          last_seen_at?: string | null
          name?: string | null
          nickname?: string | null
          profile_completed_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          hcp_index?: number
          id?: string
          is_admin?: boolean
          last_seen_at?: string | null
          name?: string | null
          nickname?: string | null
          profile_completed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_admin_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      email_is_in_auth_users: {
        Args: { email_to_check: string }
        Returns: boolean
      }
      email_is_invited: { Args: { check_email: string }; Returns: boolean }
      email_is_registered: { Args: { p_email: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_in_game: { Args: { p_game_id: string }; Returns: boolean }
      same_flight: {
        Args: { p_game_id: string; p_other_user: string }
        Returns: boolean
      }
      same_flight_or_solo: {
        Args: { p_game_id: string; p_other_user: string }
        Returns: boolean
      }
      upsert_score_if_newer: {
        Args: {
          p_client_updated_at: string
          p_entered_by: string
          p_game_id: string
          p_hole_number: number
          p_strokes: number
          p_user_id: string
        }
        Returns: {
          client_updated_at: string
          entered_by: string
          game_id: string
          hole_number: number
          strokes: number
          updated_at: string
          user_id: string
          was_applied: boolean
        }[]
      }
    }
    Enums: {
      game_status: "draft" | "scheduled" | "active" | "finished"
      player_tee_gender: "mens" | "ladies" | "juniors"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      game_status: ["draft", "scheduled", "active", "finished"],
      player_tee_gender: ["mens", "ladies", "juniors"],
    },
  },
} as const
