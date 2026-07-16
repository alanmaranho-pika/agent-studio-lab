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
      api_billing: {
        Row: {
          credit_balance: number
          monthly_spend_cap: number
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          credit_balance?: number
          monthly_spend_cap?: number
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          credit_balance?: number
          monthly_spend_cap?: number
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          secret: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          secret: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          secret?: string
          user_id?: string
        }
        Relationships: []
      }
      api_usage_events: {
        Row: {
          created_at: string
          credits: number
          id: string
          key_id: string | null
          latency_ms: number | null
          model_slug: string
          status: string
          units: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          key_id?: string | null
          latency_ms?: number | null
          model_slug: string
          status?: string
          units?: number
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          key_id?: string | null
          latency_ms?: number | null
          model_slug?: string
          status?: string
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_events_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          backstory: string
          created_at: string
          description: string
          id: string
          image_mime: string | null
          image_storage_path: string | null
          image_url: string | null
          name: string
          updated_at: string
          user_id: string
          voice_id: string | null
          voice_label: string | null
          voice_provider: string | null
        }
        Insert: {
          backstory?: string
          created_at?: string
          description?: string
          id?: string
          image_mime?: string | null
          image_storage_path?: string | null
          image_url?: string | null
          name?: string
          updated_at?: string
          user_id: string
          voice_id?: string | null
          voice_label?: string | null
          voice_provider?: string | null
        }
        Update: {
          backstory?: string
          created_at?: string
          description?: string
          id?: string
          image_mime?: string | null
          image_storage_path?: string | null
          image_url?: string | null
          name?: string
          updated_at?: string
          user_id?: string
          voice_id?: string | null
          voice_label?: string | null
          voice_provider?: string | null
        }
        Relationships: []
      }
      cms_audit_log: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          operation: string
          row_id: string | null
          summary: string | null
          table_name: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          operation: string
          row_id?: string | null
          summary?: string | null
          table_name: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          operation?: string
          row_id?: string | null
          summary?: string | null
          table_name?: string
        }
        Relationships: []
      }
      cms_media: {
        Row: {
          alt: string | null
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          label: string | null
          mime: string
          poster_url: string | null
          short_token: string | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          label?: string | null
          mime: string
          poster_url?: string | null
          short_token?: string | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          label?: string | null
          mime?: string
          poster_url?: string | null
          short_token?: string | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: []
      }
      cms_use_cases: {
        Row: {
          blocks_dirty: boolean
          body_blocks: Json
          created_at: string
          created_by: string | null
          hero_media_id: string | null
          id: string
          is_published: boolean
          markdown_source: string
          og_image_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          subline: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          blocks_dirty?: boolean
          body_blocks?: Json
          created_at?: string
          created_by?: string | null
          hero_media_id?: string | null
          id?: string
          is_published?: boolean
          markdown_source?: string
          og_image_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          subline?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          blocks_dirty?: boolean
          body_blocks?: Json
          created_at?: string
          created_by?: string | null
          hero_media_id?: string | null
          id?: string
          is_published?: boolean
          markdown_source?: string
          og_image_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          subline?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_use_cases_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "cms_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_use_cases_og_image_id_fkey"
            columns: ["og_image_id"]
            isOneToOne: false
            referencedRelation: "cms_media"
            referencedColumns: ["id"]
          },
        ]
      }
      community_shares: {
        Row: {
          created_at: string
          duration: number | null
          height: number | null
          id: string
          mime: string
          project_id: string | null
          project_title: string | null
          skill: string | null
          thumb_url: string | null
          user_avatar_url: string | null
          user_display_name: string | null
          user_id: string
          video_url: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          height?: number | null
          id?: string
          mime?: string
          project_id?: string | null
          project_title?: string | null
          skill?: string | null
          thumb_url?: string | null
          user_avatar_url?: string | null
          user_display_name?: string | null
          user_id: string
          video_url: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          height?: number | null
          id?: string
          mime?: string
          project_id?: string | null
          project_title?: string | null
          skill?: string | null
          thumb_url?: string | null
          user_avatar_url?: string | null
          user_display_name?: string | null
          user_id?: string
          video_url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_profiles: {
        Row: {
          accepted_tos_at: string | null
          company: string | null
          created_at: string
          intended_use: string | null
          onboarded_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_tos_at?: string | null
          company?: string | null
          created_at?: string
          intended_use?: string | null
          onboarded_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_tos_at?: string | null
          company?: string | null
          created_at?: string
          intended_use?: string | null
          onboarded_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      director_pika_client: {
        Row: {
          authorization_endpoint: string
          client_id: string
          created_at: string
          origin: string
          redirect_uri: string
          registration_endpoint: string | null
          token_endpoint: string
          updated_at: string
        }
        Insert: {
          authorization_endpoint: string
          client_id: string
          created_at?: string
          origin: string
          redirect_uri: string
          registration_endpoint?: string | null
          token_endpoint: string
          updated_at?: string
        }
        Update: {
          authorization_endpoint?: string
          client_id?: string
          created_at?: string
          origin?: string
          redirect_uri?: string
          registration_endpoint?: string | null
          token_endpoint?: string
          updated_at?: string
        }
        Relationships: []
      }
      director_pika_pending: {
        Row: {
          code_verifier: string
          created_at: string
          origin: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          origin: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          origin?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      director_pika_tokens: {
        Row: {
          access_token: string | null
          expires_at: string | null
          origin: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          expires_at?: string | null
          origin: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          expires_at?: string | null
          origin?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      director_user_keys: {
        Row: {
          anthropic_api_key: string | null
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic_api_key?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic_api_key?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      export_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          output_url: string | null
          progress: number
          project_id: string
          provider: string
          provider_render_id: string | null
          settings: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          output_url?: string | null
          progress?: number
          project_id: string
          provider?: string
          provider_render_id?: string | null
          settings: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          output_url?: string | null
          progress?: number
          project_id?: string
          provider?: string
          provider_render_id?: string | null
          settings?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      library_subjects: {
        Row: {
          aliases: string[]
          brand: string | null
          created_at: string
          description: string | null
          favorite: boolean
          id: string
          kind: string
          metadata: Json
          name: string
          primary_asset_storage_path: string | null
          primary_asset_url: string | null
          reference_urls: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          aliases?: string[]
          brand?: string | null
          created_at?: string
          description?: string | null
          favorite?: boolean
          id?: string
          kind: string
          metadata?: Json
          name: string
          primary_asset_storage_path?: string | null
          primary_asset_url?: string | null
          reference_urls?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          aliases?: string[]
          brand?: string | null
          created_at?: string
          description?: string | null
          favorite?: boolean
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          primary_asset_storage_path?: string | null
          primary_asset_url?: string | null
          reference_urls?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pika_connections: {
        Row: {
          client_information: Json | null
          code_verifier: string | null
          created_at: string
          expires_at: string | null
          id: string
          oauth_state: string | null
          server_url: string
          tokens: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_information?: Json | null
          code_verifier?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          oauth_state?: string | null
          server_url: string
          tokens?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_information?: Json | null
          code_verifier?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          oauth_state?: string | null
          server_url?: string
          tokens?: Json | null
          updated_at?: string
          user_id?: string
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
          width: number | null
        }
        Insert: {
          attached_to?: string | null
          created_at?: string
          duration?: number | null
          height?: number | null
          id?: string
          kind: string
          label?: string | null
          mime: string
          name: string
          project_id: string
          storage_path?: string | null
          url: string
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
      project_cuts: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_cut_id: string | null
          project_id: string
          timeline: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_cut_id?: string | null
          project_id: string
          timeline?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_cut_id?: string | null
          project_id?: string
          timeline?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cuts_parent_cut_id_fkey"
            columns: ["parent_cut_id"]
            isOneToOne: false
            referencedRelation: "project_cuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cuts_project_id_fkey"
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
          kind: string
          max_attempts: number
          mode: string | null
          model: string
          placeholder_asset_id: string | null
          project_id: string
          prompt: string | null
          provider: string
          response_url: string | null
          result_url: string | null
          status: string
          status_url: string | null
          updated_at: string
          user_id: string
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
          kind?: string
          max_attempts?: number
          mode?: string | null
          model: string
          placeholder_asset_id?: string | null
          project_id: string
          prompt?: string | null
          provider?: string
          response_url?: string | null
          result_url?: string | null
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id: string
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
          kind?: string
          max_attempts?: number
          mode?: string | null
          model?: string
          placeholder_asset_id?: string | null
          project_id?: string
          prompt?: string | null
          provider?: string
          response_url?: string | null
          result_url?: string | null
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_jobs_placeholder_asset_id_fkey"
            columns: ["placeholder_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
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
        }
        Insert: {
          created_at?: string
          id?: string
          parts: Json
          project_id: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          project_id?: string
          role?: string
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
          active_cut_id: string | null
          agent_version: string
          anchors: Json
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
          active_cut_id?: string | null
          agent_version?: string
          anchors?: Json
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
          active_cut_id?: string | null
          agent_version?: string
          anchors?: Json
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
        Relationships: [
          {
            foreignKeyName: "projects_active_cut_id_fkey"
            columns: ["active_cut_id"]
            isOneToOne: false
            referencedRelation: "project_cuts"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          created_at: string
          error: string | null
          final_asset_id: string | null
          finished_at: string | null
          id: string
          project_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          final_asset_id?: string | null
          finished_at?: string | null
          id?: string
          project_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          final_asset_id?: string | null
          finished_at?: string | null
          id?: string
          project_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_final_asset_id_fkey"
            columns: ["final_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      render_scene_outputs: {
        Row: {
          asset_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          model: string | null
          prompt: string | null
          render_job_id: string
          scene_id: string
          scene_n: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          model?: string | null
          prompt?: string | null
          render_job_id: string
          scene_id: string
          scene_n?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          model?: string | null
          prompt?: string | null
          render_job_id?: string
          scene_id?: string
          scene_n?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_scene_outputs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_scene_outputs_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_assets: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          label: string | null
          role: string
          skill_id: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          label?: string | null
          role?: string
          skill_id: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          label?: string | null
          role?: string
          skill_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "skill_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_assets_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_installs: {
        Row: {
          created_at: string
          id: string
          pinned: boolean
          skill_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned?: boolean
          skill_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned?: boolean
          skill_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_installs_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          author_id: string | null
          body_md: string | null
          category: string | null
          cover_asset_id: string | null
          created_at: string
          id: string
          install_count: number
          manifest: Json
          name: string
          one_liner: string | null
          slug: string
          source: string
          tags: string[]
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          author_id?: string | null
          body_md?: string | null
          category?: string | null
          cover_asset_id?: string | null
          created_at?: string
          id?: string
          install_count?: number
          manifest?: Json
          name: string
          one_liner?: string | null
          slug: string
          source: string
          tags?: string[]
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string | null
          category?: string | null
          cover_asset_id?: string | null
          created_at?: string
          id?: string
          install_count?: number
          manifest?: Json
          name?: string
          one_liner?: string | null
          slug?: string
          source?: string
          tags?: string[]
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: []
      }
      workspace_pages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          ord: number
          page: Json
          project_id: string
          snapshots: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          ord?: number
          page?: Json
          project_id: string
          snapshots?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          ord?: number
          page?: Json
          project_id?: string
          snapshots?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      director_mutate_state: {
        Args: { _next_state: Json; _next_title?: string; _project_id: string }
        Returns: Json
      }
      is_pika_admin: { Args: { _user_id: string }; Returns: boolean }
      is_pika_editor: { Args: { _user_id: string }; Returns: boolean }
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
