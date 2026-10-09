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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_audit_events: {
        Row: {
          actor_id: string
          command: string
          created_at: string
          details: Json
          id: number
          intent: string
          plan_id: string | null
          status: string
          tool: string
          workspace_id: string | null
        }
        Insert: {
          actor_id: string
          command?: string
          created_at?: string
          details?: Json
          id?: number
          intent?: string
          plan_id?: string | null
          status: string
          tool?: string
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string
          command?: string
          created_at?: string
          details?: Json
          id?: number
          intent?: string
          plan_id?: string | null
          status?: string
          tool?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plans: {
        Row: {
          command: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
          payload_hash: string
          result: Json | null
          revision: number
          state: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          command: string
          created_at?: string
          expires_at: string
          id?: string
          payload: Json
          payload_hash: string
          result?: Json | null
          revision?: number
          state?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          command?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          payload_hash?: string
          result?: Json | null
          revision?: number
          state?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ai_workspaces: {
        Row: {
          context: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assessment_logs: {
        Row: {
          actor_id: string | null
          after_value: Json | null
          ai_plan_id: string | null
          before_value: Json | null
          component: string
          created_at: string
          id: number
          reason: string
          student_id: string | null
        }
        Insert: {
          actor_id?: string | null
          after_value?: Json | null
          ai_plan_id?: string | null
          before_value?: Json | null
          component: string
          created_at?: string
          id?: number
          reason?: string
          student_id?: string | null
        }
        Update: {
          actor_id?: string | null
          after_value?: Json | null
          ai_plan_id?: string | null
          before_value?: Json | null
          component?: string
          created_at?: string
          id?: number
          reason?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_logs_ai_plan_id_fkey"
            columns: ["ai_plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_versions: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          label: string
          number: number
          state: string
        }
        Insert: {
          config: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          number: number
          state: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          number?: number
          state?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          data: Json
          id: string
          revision: number
          state: string
          student_id: string
          updated_at: string
          updated_by: string | null
          version_id: string
        }
        Insert: {
          data: Json
          id?: string
          revision?: number
          state?: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
          version_id: string
        }
        Update: {
          data?: Json
          id?: string
          revision?: number
          state?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "assessment_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      configuration_drafts: {
        Row: {
          base_version: string
          config: Json
          id: number
          revision: number
          updated_at: string
        }
        Insert: {
          base_version: string
          config: Json
          id: number
          revision?: number
          updated_at?: string
        }
        Update: {
          base_version?: string
          config?: Json
          id?: number
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuration_drafts_base_version_fkey"
            columns: ["base_version"]
            isOneToOne: false
            referencedRelation: "assessment_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          report: Json
          source: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          report: Json
          source: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          report?: Json
          source?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      rombels: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          npm: string
          rombel_id: number
          study_case: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          npm: string
          rombel_id: number
          study_case?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          npm?: string
          rombel_id?: number
          study_case?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_rombel_id_fkey"
            columns: ["rombel_id"]
            isOneToOne: false
            referencedRelation: "rombels"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "asisten"
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
      app_role: ["admin", "asisten"],
    },
  },
} as const
