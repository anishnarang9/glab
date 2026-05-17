// Typed database schema and query helpers.
// Import Database into supabase.ts and API routes for end-to-end type safety.

export type ArtifactType = 'project' | 'note' | 'paper_ref' | 'finding' | 'hypothesis'
export type ArtifactTier = 'private' | 'shared'
export type RelationshipType = 'validates' | 'suggests_change' | 'extends' | 'scoops' | 'orthogonal'
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type BrainStatus = 'active' | 'paused' | 'archived'
export type BrainSourceKind = 'arxiv_query' | 'rss_feed' | 'web_page' | 'hog_news' | 'researcher_shared_artifacts' | 'manual_upload'
export type BrainSourceCadence = 'manual' | 'hourly' | 'daily'
export type OpenClawInstanceRole = 'head_gbrain_operator'
export type OpenClawInstanceStatus = 'active' | 'paused' | 'revoked'
export type IngestionRunTrigger = 'morning_cron' | 'manual' | 'researcher_share' | 'source_refresh' | 'openclaw_worker'
export type IngestionRunStatus = 'running' | 'succeeded' | 'failed' | 'skipped'
export type OpenClawDecisionType = 'ingest' | 'skip' | 'claim_created' | 'claim_supported' | 'claim_contradicted' | 'claim_refined' | 'request_human_review'
export type OpenClawDecisionStatus = 'proposed' | 'applied' | 'rejected' | 'failed'
export type TruthClaimStatus = 'active' | 'contested' | 'superseded' | 'retracted'
export type TruthEvidenceRelationship = 'supports' | 'contradicts' | 'refines' | 'duplicates' | 'background' | 'orthogonal'
export type BrainCommitKind = 'source_ingested' | 'evidence_added' | 'openclaw_decision' | 'claim_created' | 'claim_supported' | 'claim_weakened' | 'claim_contradicted' | 'claim_refined' | 'researcher_relevance_changed' | 'digest_rendered'
export type BrainCommitEntityType = 'source' | 'run' | 'evidence' | 'claim' | 'revision' | 'edge' | 'digest' | 'artifact' | 'operator' | 'decision'
export type BrainCommitChangeType = 'created' | 'updated' | 'linked' | 'skipped'

export interface Database {
  public: {
    Tables: {
      researchers: {
        Row: {
          id: string
          name: string
          email: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['researchers']['Insert']>
        Relationships: []
      }
      artifacts: {
        Row: {
          id: string
          owner_id: string | null
          brain_id: string | null
          type: ArtifactType
          tier: ArtifactTier
          title: string | null
          content: string
          embedding: number[] | null
          created_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          brain_id?: string | null
          type: ArtifactType
          tier?: ArtifactTier
          title?: string | null
          content: string
          embedding?: number[] | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['artifacts']['Insert']>
        Relationships: []
      }
      papers: {
        Row: {
          id: string
          arxiv_id: string
          title: string
          abstract: string
          authors: string[] | null
          published_at: string | null
          embedding: number[] | null
          ingested_at: string
        }
        Insert: {
          id?: string
          arxiv_id: string
          title: string
          abstract: string
          authors?: string[] | null
          published_at?: string | null
          embedding?: number[] | null
          ingested_at?: string
        }
        Update: Partial<Database['public']['Tables']['papers']['Insert']>
        Relationships: []
      }
      paper_matches: {
        Row: {
          id: string
          paper_id: string | null
          project_artifact_id: string | null
          researcher_id: string | null
          relationship: RelationshipType | null
          rationale: string | null
          confidence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          paper_id?: string | null
          project_artifact_id?: string | null
          researcher_id?: string | null
          relationship?: RelationshipType | null
          rationale?: string | null
          confidence?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['paper_matches']['Insert']>
        Relationships: []
      }
      brains: {
        Row: {
          id: string
          name: string
          subject: string
          mission: string | null
          status: BrainStatus
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          subject: string
          mission?: string | null
          status?: BrainStatus
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['brains']['Insert']>
        Relationships: []
      }
      brain_sources: {
        Row: {
          id: string
          brain_id: string | null
          kind: BrainSourceKind
          label: string
          config: Json
          cadence: BrainSourceCadence
          enabled: boolean
          last_checked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brain_id?: string | null
          kind: BrainSourceKind
          label: string
          config?: Json
          cadence?: BrainSourceCadence
          enabled?: boolean
          last_checked_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['brain_sources']['Insert']>
        Relationships: []
      }
      openclaw_instances: {
        Row: {
          id: string
          brain_id: string
          name: string
          role: OpenClawInstanceRole
          endpoint_url: string | null
          status: OpenClawInstanceStatus
          access_scope: Json
          last_heartbeat_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brain_id: string
          name: string
          role?: OpenClawInstanceRole
          endpoint_url?: string | null
          status?: OpenClawInstanceStatus
          access_scope?: Json
          last_heartbeat_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['openclaw_instances']['Insert']>
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          id: string
          brain_id: string | null
          source_id: string | null
          trigger: IngestionRunTrigger
          status: IngestionRunStatus
          started_at: string
          finished_at: string | null
          error: string | null
        }
        Insert: {
          id?: string
          brain_id?: string | null
          source_id?: string | null
          trigger: IngestionRunTrigger
          status?: IngestionRunStatus
          started_at?: string
          finished_at?: string | null
          error?: string | null
        }
        Update: Partial<Database['public']['Tables']['ingestion_runs']['Insert']>
        Relationships: []
      }
      evidence_items: {
        Row: {
          id: string
          brain_id: string | null
          source_id: string | null
          ingestion_run_id: string | null
          artifact_id: string | null
          paper_id: string | null
          source_kind: string
          source_ref: string | null
          title: string | null
          content: string
          url: string | null
          published_at: string | null
          embedding: number[] | null
          content_hash: string
          created_at: string
        }
        Insert: {
          id?: string
          brain_id?: string | null
          source_id?: string | null
          ingestion_run_id?: string | null
          artifact_id?: string | null
          paper_id?: string | null
          source_kind: string
          source_ref?: string | null
          title?: string | null
          content: string
          url?: string | null
          published_at?: string | null
          embedding?: number[] | null
          content_hash: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['evidence_items']['Insert']>
        Relationships: []
      }
      openclaw_decisions: {
        Row: {
          id: string
          brain_id: string
          instance_id: string | null
          ingestion_run_id: string | null
          evidence_id: string | null
          decision_type: OpenClawDecisionType
          subject: string
          rationale: string | null
          confidence: number | null
          payload: Json
          status: OpenClawDecisionStatus
          created_at: string
          applied_at: string | null
          error: string | null
        }
        Insert: {
          id?: string
          brain_id: string
          instance_id?: string | null
          ingestion_run_id?: string | null
          evidence_id?: string | null
          decision_type: OpenClawDecisionType
          subject: string
          rationale?: string | null
          confidence?: number | null
          payload?: Json
          status?: OpenClawDecisionStatus
          created_at?: string
          applied_at?: string | null
          error?: string | null
        }
        Update: Partial<Database['public']['Tables']['openclaw_decisions']['Insert']>
        Relationships: []
      }
      truth_claims: {
        Row: {
          id: string
          brain_id: string | null
          statement: string
          status: TruthClaimStatus
          confidence: number | null
          current_revision_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brain_id?: string | null
          statement: string
          status?: TruthClaimStatus
          confidence?: number | null
          current_revision_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['truth_claims']['Insert']>
        Relationships: []
      }
      brain_commits: {
        Row: {
          id: string
          brain_id: string | null
          parent_commit_id: string | null
          ingestion_run_id: string | null
          kind: BrainCommitKind
          summary: string
          commit_hash: string
          created_at: string
        }
        Insert: {
          id?: string
          brain_id?: string | null
          parent_commit_id?: string | null
          ingestion_run_id?: string | null
          kind: BrainCommitKind
          summary: string
          commit_hash: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['brain_commits']['Insert']>
        Relationships: []
      }
      truth_revisions: {
        Row: {
          id: string
          claim_id: string | null
          commit_id: string | null
          statement: string
          confidence: number | null
          rationale: string | null
          created_at: string
        }
        Insert: {
          id?: string
          claim_id?: string | null
          commit_id?: string | null
          statement: string
          confidence?: number | null
          rationale?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['truth_revisions']['Insert']>
        Relationships: []
      }
      truth_evidence_edges: {
        Row: {
          id: string
          claim_id: string | null
          evidence_id: string | null
          relationship: TruthEvidenceRelationship
          rationale: string | null
          confidence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          claim_id?: string | null
          evidence_id?: string | null
          relationship: TruthEvidenceRelationship
          rationale?: string | null
          confidence?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['truth_evidence_edges']['Insert']>
        Relationships: []
      }
      brain_commit_changes: {
        Row: {
          id: string
          commit_id: string | null
          entity_type: BrainCommitEntityType
          entity_id: string
          change_type: BrainCommitChangeType
          before_json: Json | null
          after_json: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          commit_id?: string | null
          entity_type: BrainCommitEntityType
          entity_id: string
          change_type: BrainCommitChangeType
          before_json?: Json | null
          after_json?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['brain_commit_changes']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Re-export convenience row types
export type Researcher = Database['public']['Tables']['researchers']['Row']
export type Artifact = Database['public']['Tables']['artifacts']['Row']
export type Paper = Database['public']['Tables']['papers']['Row']
export type PaperMatch = Database['public']['Tables']['paper_matches']['Row']
export type Brain = Database['public']['Tables']['brains']['Row']
export type BrainSource = Database['public']['Tables']['brain_sources']['Row']
export type OpenClawInstance = Database['public']['Tables']['openclaw_instances']['Row']
export type IngestionRun = Database['public']['Tables']['ingestion_runs']['Row']
export type EvidenceItem = Database['public']['Tables']['evidence_items']['Row']
export type OpenClawDecision = Database['public']['Tables']['openclaw_decisions']['Row']
export type TruthClaim = Database['public']['Tables']['truth_claims']['Row']
export type BrainCommit = Database['public']['Tables']['brain_commits']['Row']
export type TruthRevision = Database['public']['Tables']['truth_revisions']['Row']
export type TruthEvidenceEdge = Database['public']['Tables']['truth_evidence_edges']['Row']
export type BrainCommitChange = Database['public']['Tables']['brain_commit_changes']['Row']
