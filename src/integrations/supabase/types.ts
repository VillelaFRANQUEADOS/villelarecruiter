export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      candidato_status_log: {
        Row: {
          candidato_id: string
          changed_by: string | null
          changed_by_nome: string | null
          created_at: string
          id: string
          status_anterior: Database["public"]["Enums"]["candidato_status"] | null
          status_novo: Database["public"]["Enums"]["candidato_status"]
        }
        Insert: {
          candidato_id: string
          changed_by?: string | null
          changed_by_nome?: string | null
          created_at?: string
          id?: string
          status_anterior?: Database["public"]["Enums"]["candidato_status"] | null
          status_novo: Database["public"]["Enums"]["candidato_status"]
        }
        Update: {
          candidato_id?: string
          changed_by?: string | null
          changed_by_nome?: string | null
          created_at?: string
          id?: string
          status_anterior?: Database["public"]["Enums"]["candidato_status"] | null
          status_novo?: Database["public"]["Enums"]["candidato_status"]
        }
        Relationships: [
          {
            foreignKeyName: "candidato_status_log_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatos: {
        Row: {
          agendado_em: string | null
          agendado_por_id: string | null
          agendado_por_nome: string | null
          cidade: string | null
          cidade_original_extraida: string | null
          cidade_validada: boolean
          codigo_ibge: string | null
          created_at: string
          curriculo_url: string | null
          data_entrevista: string | null
          deleted_at: string | null
          email: string | null
          entrevistador: string | null
          estado: string | null
          experiencias: string | null
          horario_entrevista: string | null
          id: string
          nome: string
          observacoes: string | null
          observacoes_updated_at: string | null
          observacoes_updated_by: string | null
          observacoes_updated_by_nome: string | null
          origem_curriculo: string
          recrutador_id: string | null
          regiao: string | null
          sharepoint_etag: string | null
          sharepoint_item_id: string | null
          sharepoint_synced_at: string | null
          status: Database["public"]["Enums"]["candidato_status"]
          telefone: string | null
          ultimo_reprocessamento_at: string | null
          updated_at: string
          vaga: string | null
        }
        Insert: {
          agendado_em?: string | null
          agendado_por_id?: string | null
          agendado_por_nome?: string | null
          cidade?: string | null
          cidade_original_extraida?: string | null
          cidade_validada?: boolean
          codigo_ibge?: string | null
          created_at?: string
          curriculo_url?: string | null
          data_entrevista?: string | null
          deleted_at?: string | null
          email?: string | null
          entrevistador?: string | null
          estado?: string | null
          experiencias?: string | null
          horario_entrevista?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          observacoes_updated_at?: string | null
          observacoes_updated_by?: string | null
          observacoes_updated_by_nome?: string | null
          origem_curriculo?: string
          recrutador_id?: string | null
          regiao?: string | null
          sharepoint_etag?: string | null
          sharepoint_item_id?: string | null
          sharepoint_synced_at?: string | null
          status?: Database["public"]["Enums"]["candidato_status"]
          telefone?: string | null
          ultimo_reprocessamento_at?: string | null
          updated_at?: string
          vaga?: string | null
        }
        Update: {
          agendado_em?: string | null
          agendado_por_id?: string | null
          agendado_por_nome?: string | null
          cidade?: string | null
          cidade_original_extraida?: string | null
          cidade_validada?: boolean
          codigo_ibge?: string | null
          created_at?: string
          curriculo_url?: string | null
          data_entrevista?: string | null
          deleted_at?: string | null
          email?: string | null
          entrevistador?: string | null
          estado?: string | null
          experiencias?: string | null
          horario_entrevista?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          observacoes_updated_at?: string | null
          observacoes_updated_by?: string | null
          observacoes_updated_by_nome?: string | null
          origem_curriculo?: string
          recrutador_id?: string | null
          regiao?: string | null
          sharepoint_etag?: string | null
          sharepoint_item_id?: string | null
          sharepoint_synced_at?: string | null
          status?: Database["public"]["Enums"]["candidato_status"]
          telefone?: string | null
          ultimo_reprocessamento_at?: string | null
          updated_at?: string
          vaga?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatos_agendado_por_id_fkey"
            columns: ["agendado_por_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: { ativo: boolean; created_at: string; email: string; id: string; nome: string }
        Insert: { ativo?: boolean; created_at?: string; email: string; id: string; nome: string }
        Update: { ativo?: boolean; created_at?: string; email?: string; id?: string; nome?: string }
        Relationships: []
      }
      sharepoint_config: { Row: { enabled: boolean; id: boolean; last_delta_link: string | null; last_sync_at: string | null; last_sync_message: string | null; last_sync_status: string | null; list_id: string | null; list_name: string | null; site_id: string | null; site_name: string | null; site_url: string | null; updated_at: string }; Insert: { enabled?: boolean; id?: boolean; last_delta_link?: string | null; last_sync_at?: string | null; last_sync_message?: string | null; last_sync_status?: string | null; list_id?: string | null; list_name?: string | null; site_id?: string | null; site_name?: string | null; site_url?: string | null; updated_at?: string }; Update: { enabled?: boolean; id?: boolean; last_delta_link?: string | null; last_sync_at?: string | null; last_sync_message?: string | null; last_sync_status?: string | null; list_id?: string | null; list_name?: string | null; site_id?: string | null; site_name?: string | null; site_url?: string | null; updated_at?: string }; Relationships: [] }
      sharepoint_outbox: { Row: { attempts: number; candidato_id: string; created_at: string; id: number; last_error: string | null; op: string }; Insert: { attempts?: number; candidato_id: string; created_at?: string; id?: number; last_error?: string | null; op: string }; Update: { attempts?: number; candidato_id?: string; created_at?: string; id?: number; last_error?: string | null; op?: string }; Relationships: [{ foreignKeyName: "sharepoint_outbox_candidato_id_fkey"; columns: ["candidato_id"]; isOneToOne: false; referencedRelation: "candidatos"; referencedColumns: ["id"] }] }
      user_roles: { Row: { id: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }; Insert: { id?: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }; Update: { id?: string; role?: Database["public"]["Enums"]["app_role"]; user_id?: string }; Relationships: [] }
      unidades: { Row: { ativo: boolean; cidade: string; created_at: string; estado: string; id: string; nome: string; updated_at: string; coordenadas: Json | null; codigo_ibge: string | null }; Insert: { ativo?: boolean; cidade: string; created_at?: string; estado: string; id?: string; nome: string; updated_at?: string; coordenadas?: Json | null; codigo_ibge?: string | null }; Update: { ativo?: boolean; cidade?: string; created_at?: string; estado?: string; id?: string; nome?: string; updated_at?: string; coordenadas?: Json | null; codigo_ibge?: string | null }; Relationships: [] }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      app_role: "admin" | "agendamento" | "recrutador"
      candidato_status: "aguardando_contato" | "aguardando_retorno" | "sem_interesse" | "agendado"
    }
    CompositeTypes: { [_ in never]: never }
  }
}
