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
          par_juniors: number
          par_ladies: number
          par_mens: number
          stroke_index: number
        }
        Insert: {
          course_id: string
          hole_number: number
          par_juniors: number
          par_ladies: number
          par_mens: number
          stroke_index: number
        }
        Update: {
          course_id?: string
          hole_number?: number
          par_juniors?: number
          par_ladies?: number
          par_mens?: number
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
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_updated_by_fkey"
            columns: ["updated_by"]
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
      game_registration_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by_user_id: string | null
          game_id: string
          id: string
          is_team_captain: boolean
          message: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["registration_request_status"]
          team_name: string | null
          team_request_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          game_id: string
          id?: string
          is_team_captain?: boolean
          message?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["registration_request_status"]
          team_name?: string | null
          team_request_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          game_id?: string
          id?: string
          is_team_captain?: boolean
          message?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["registration_request_status"]
          team_name?: string | null
          team_request_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_registration_requests_decided_by_user_id_fkey"
            columns: ["decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_registration_requests_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_registration_requests_team_request_id_fkey"
            columns: ["team_request_id"]
            isOneToOne: false
            referencedRelation: "game_registration_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_registration_requests_user_id_fkey"
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
          registration_mode: Database["public"]["Enums"]["registration_mode"]
          registration_type: Database["public"]["Enums"]["registration_type"]
          require_peer_approval: boolean
          scheduled_tee_off_at: string | null
          score_visibility: string
          short_id: string
          side_ctp_count: number
          side_disabled_categories: string[]
          side_ld_count: number
          side_tournament_enabled: boolean
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          tee_box_id: string | null
          tournament_id: string | null
          tournament_match_label: string | null
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
          registration_mode?: Database["public"]["Enums"]["registration_mode"]
          registration_type?: Database["public"]["Enums"]["registration_type"]
          require_peer_approval?: boolean
          scheduled_tee_off_at?: string | null
          score_visibility?: string
          short_id?: string
          side_ctp_count?: number
          side_disabled_categories?: string[]
          side_ld_count?: number
          side_tournament_enabled?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          tee_box_id?: string | null
          tournament_id?: string | null
          tournament_match_label?: string | null
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
          registration_mode?: Database["public"]["Enums"]["registration_mode"]
          registration_type?: Database["public"]["Enums"]["registration_type"]
          require_peer_approval?: boolean
          scheduled_tee_off_at?: string | null
          score_visibility?: string
          short_id?: string
          side_ctp_count?: number
          side_disabled_categories?: string[]
          side_ld_count?: number
          side_tournament_enabled?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          tee_box_id?: string | null
          tournament_id?: string | null
          tournament_match_label?: string | null
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
          {
            foreignKeyName: "games_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_update_digests: {
        Row: {
          id: string
          period_end: string
          period_start: string
          recipient_count: number
          sent_at: string
          sent_by: string | null
          update_ids: string[]
        }
        Insert: {
          id?: string
          period_end: string
          period_start: string
          recipient_count: number
          sent_at?: string
          sent_by?: string | null
          update_ids: string[]
        }
        Update: {
          id?: string
          period_end?: string
          period_start?: string
          recipient_count?: number
          sent_at?: string
          sent_by?: string | null
          update_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "product_update_digests_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_updates: {
        Row: {
          body: string
          created_at: string
          created_by: string
          cta_label: string | null
          id: string
          link: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          cta_label?: string | null
          id?: string
          link?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          cta_label?: string | null
          id?: string
          link?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_updates_created_by_fkey"
            columns: ["created_by"]
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
          archived_at: string | null
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
          archived_at?: string | null
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
          archived_at?: string | null
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
      tournaments: {
        Row: {
          created_at: string
          created_by: string
          finished_at: string | null
          id: string
          name: string
          points_to_win: number
          started_at: string | null
          status: string
          team_1_name: string
          team_2_name: string
          winner_team: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          finished_at?: string | null
          id?: string
          name: string
          points_to_win: number
          started_at?: string | null
          status?: string
          team_1_name: string
          team_2_name: string
          winner_team?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          finished_at?: string | null
          id?: string
          name?: string
          points_to_win?: number
          started_at?: string | null
          status?: string
          team_1_name?: string
          team_2_name?: string
          winner_team?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          gender: Database["public"]["Enums"]["user_gender"] | null
          handicap_updated_at: string
          hcp_index: number
          id: string
          is_admin: boolean
          last_seen_at: string | null
          level: Database["public"]["Enums"]["player_level"]
          name: string | null
          nickname: string | null
          product_updates_unsubscribed_at: string | null
          profile_completed_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          gender?: Database["public"]["Enums"]["user_gender"] | null
          handicap_updated_at?: string
          hcp_index?: number
          id: string
          is_admin?: boolean
          last_seen_at?: string | null
          level?: Database["public"]["Enums"]["player_level"]
          name?: string | null
          nickname?: string | null
          product_updates_unsubscribed_at?: string | null
          profile_completed_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          gender?: Database["public"]["Enums"]["user_gender"] | null
          handicap_updated_at?: string
          hcp_index?: number
          id?: string
          is_admin?: boolean
          last_seen_at?: string | null
          level?: Database["public"]["Enums"]["player_level"]
          name?: string | null
          nickname?: string | null
          product_updates_unsubscribed_at?: string | null
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
      generate_game_short_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_game_creator_or_admin: {
        Args: { p_game_id: string }
        Returns: boolean
      }
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
      player_level: "junior" | "normal" | "senior"
      player_tee_gender: "mens" | "ladies" | "juniors"
      registration_mode: "invite_only" | "manual_approval" | "open"
      registration_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "withdrawn"
      registration_type: "solo" | "team" | "both"
      user_gender: "mens" | "ladies"
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
      player_level: ["junior", "normal", "senior"],
      player_tee_gender: ["mens", "ladies", "juniors"],
      registration_mode: ["invite_only", "manual_approval", "open"],
      registration_request_status: [
        "pending",
        "approved",
        "rejected",
        "withdrawn",
      ],
      registration_type: ["solo", "team", "both"],
      user_gender: ["mens", "ladies"],
    },
  },
} as const
