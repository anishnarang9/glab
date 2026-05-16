// Typed database schema and query helpers.
// Import Database into supabase.ts and API routes for end-to-end type safety.

export type ArtifactType = 'project' | 'note' | 'paper_ref' | 'finding' | 'hypothesis'
export type ArtifactTier = 'private' | 'shared'
export type RelationshipType = 'validates' | 'suggests_change' | 'extends' | 'scoops' | 'orthogonal'

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
      }
      artifacts: {
        Row: {
          id: string
          owner_id: string | null
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
          type: ArtifactType
          tier?: ArtifactTier
          title?: string | null
          content: string
          embedding?: number[] | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['artifacts']['Insert']>
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
      }
    }
  }
}

// Re-export convenience row types
export type Researcher = Database['public']['Tables']['researchers']['Row']
export type Artifact = Database['public']['Tables']['artifacts']['Row']
export type Paper = Database['public']['Tables']['papers']['Row']
export type PaperMatch = Database['public']['Tables']['paper_matches']['Row']
