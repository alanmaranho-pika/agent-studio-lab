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
      agent_skills: {
        Row: {
          app_id: string
          body_md: string
          created_at: string
          id: string
          intent: string
          is_active: boolean
          kind: string
          label: string
          matches: string[]
          mode: string | null
          model: string | null
          one_liner: string
          outputs: string[]
          sort_order: number
          steps: Json
          updated_at: string
          uses_blocks: string[]
          version: number
        }
        Insert: {
          app_id: string
          body_md: string
          created_at?: string
          id: string
          intent: string
          is_active?: boolean
          kind: string
          label: string
          matches?: string[]
          mode?: string | null
          model?: string | null
          one_liner: string
          outputs?: string[]
          sort_order?: number
          steps?: Json
          updated_at?: string
          uses_blocks?: string[]
          version?: number
        }
        Update: {
          app_id?: string
          body_md?: string
          created_at?: string
          id?: string
          intent?: string
          is_active?: boolean
          kind?: string
          label?: string
          matches?: string[]
          mode?: string | null
          model?: string | null
          one_liner?: string
          outputs?: string[]
          sort_order?: number
          steps?: Json
          updated_at?: string
          uses_blocks?: string[]
          version?: number
        }
        Relationships: []
      }
      agent_skill_versions: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          actor_type: string
          body_md: string
          created_at: string
          id: number
          restored_from_version: number | null
          skill_id: string
          version: number
        }
        Insert: {
          action?: string
          actor_id?: string | null
          actor_name: string
          actor_type: string
          body_md: string
          created_at?: string
          id?: never
          restored_from_version?: number | null
          skill_id: string
          version: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          actor_type?: string
          body_md?: string
          created_at?: string
          id?: never
          restored_from_version?: number | null
          skill_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_skill_versions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_assets: {
        Row: {
          attached_to: string | null
          created_at: string
          duration: number | null
          height: number | null
          id: string
          kind: string
          label: string | null
          mime: string
          name: string
          project_id: string
          storage_path: string | null
          url: string
          user_id: string | null
          width: number | null
        }
        Insert: {
          attached_to?: string | null
          created_at?: string
          duration?: number | null
          height?: number | null
          id?: string
          kind?: string
          label?: string | null
          mime?: string
          name?: string
          project_id: string
          storage_path?: string | null
          url?: string
          user_id?: string | null
          width?: number | null
        }
        Update: {
          attached_to?: string | null
          created_at?: string
          duration?: number | null
          height?: number | null
          id?: string
          kind?: string
          label?: string | null
          mime?: string
          name?: string
          project_id?: string
          storage_path?: string | null
          url?: string
          user_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_jobs: {
        Row: {
          app_id: string | null
          app_label: string | null
          asset_id: string | null
          attempts: number
          created_at: string
          error: string | null
          external_id: string | null
          id: string
          input: Json | null
          max_attempts: number
          mode: string | null
          model: string
          placeholder_asset_id: string | null
          project_id: string
          prompt: string | null
          response_url: string | null
          result_url: string | null
          status: string
          status_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          app_id?: string | null
          app_label?: string | null
          asset_id?: string | null
          attempts?: number
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          input?: Json | null
          max_attempts?: number
          mode?: string | null
          model: string
          placeholder_asset_id?: string | null
          project_id: string
          prompt?: string | null
          response_url?: string | null
          result_url?: string | null
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          app_id?: string | null
          app_label?: string | null
          asset_id?: string | null
          attempts?: number
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          input?: Json | null
          max_attempts?: number
          mode?: string | null
          model?: string
          placeholder_asset_id?: string | null
          project_id?: string
          prompt?: string | null
          response_url?: string | null
          result_url?: string | null
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          project_id: string
          role: string
          tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          project_id: string
          role: string
          tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          project_id?: string
          role?: string
          tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          project_state: Json
          skill: string | null
          status: string
          studio_mode: string
          studio_model: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_state?: Json
          skill?: string | null
          status?: string
          studio_mode?: string
          studio_model?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_state?: Json
          skill?: string | null
          status?: string
          studio_mode?: string
          studio_model?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_agent_skill: {
        Args: {
          p_actor_id: string
          p_actor_name: string
          p_app_id: string
          p_body_md: string
          p_id: string
          p_intent: string
          p_kind: string
          p_label: string
          p_matches: string[]
          p_mode: string | null
          p_model: string | null
          p_one_liner: string
          p_outputs: string[]
          p_steps: Json
          p_uses_blocks: string[]
        }
        Returns: {
          new_app_id: string
          new_created_at: string
          new_id: string
          new_version: number
        }[]
      }
      restore_agent_skill_body: {
        Args: {
          p_actor_id: string
          p_actor_name: string
          p_app_id: string
          p_expected_version: number
          p_target_version: number
        }
        Returns: {
          new_body_md: string
          new_updated_at: string
          new_version: number
        }[]
      }
      update_agent_skill_body: {
        Args: {
          p_actor_id: string
          p_actor_name: string
          p_actor_type: string
          p_app_id: string
          p_body_md: string
          p_expected_version: number
        }
        Returns: {
          new_body_md: string
          new_updated_at: string
          new_version: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
