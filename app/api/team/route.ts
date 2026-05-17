import { supabaseAdmin } from '@/lib/supabase'
import { loadCentralBrainState } from '@/lib/brain-state'

type ResearcherRow = {
  id: string
  name: string
  email: string
  created_at: string
}

type ProjectRow = {
  id: string
  owner_id: string | null
  type: string
  title: string | null
  content: string
}

type MatchRow = {
  id: string
  paper_id: string | null
  researcher_id: string | null
  relationship: string | null
  rationale: string | null
  confidence: number | null
  created_at: string
}

type PaperRow = {
  id: string
  title: string
  authors: string[] | null
  arxiv_id: string | null
  published_at: string | null
}

export async function GET() {
  const supabase = supabaseAdmin()
  const defaultBrainName = process.env.LABBRAIN_DEFAULT_BRAIN_NAME ?? 'LabBrain'

  const [researchers, projects, matches, papers, brain] = await Promise.all([
    supabase.from('researchers').select('id, name, email, created_at').order('name'),
    supabase
      .from('artifacts')
      .select('id, owner_id, type, title, content')
      .eq('tier', 'shared')
      .eq('type', 'project'),
    supabase
      .from('paper_matches')
      .select('id, paper_id, researcher_id, relationship, rationale, confidence, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('papers').select('id, title, authors, arxiv_id, published_at'),
    supabase
      .from('brains')
      .select('id, name, subject, mission, status')
      .eq('name', defaultBrainName)
      .maybeSingle(),
  ])

  for (const result of [researchers, projects, matches, papers, brain]) {
    if (result.error) {
      return Response.json({ error: result.error.message }, { status: 500 })
    }
  }

  const centralBrain = brain.data
    ? {
        ...brain.data,
        state: await loadCentralBrainState({
          brainId: brain.data.id,
          claims: 8,
          evidence: 8,
          commits: 5,
        }),
      }
    : null

  const paperById = new Map((papers.data as PaperRow[]).map((paper) => [paper.id, paper]))
  const sharedProjects = projects.data as ProjectRow[]
  const paperMatches = matches.data as MatchRow[]

  const data = (researchers.data as ResearcherRow[]).map((researcher) => ({
    id: researcher.id,
    name: researcher.name,
    email: researcher.email,
    created_at: researcher.created_at,
    projects: sharedProjects.filter((project) => project.owner_id === researcher.id),
    matches: paperMatches
      .filter((match) => match.researcher_id === researcher.id)
      .slice(0, 3)
      .map((match) => ({
        ...match,
        papers: match.paper_id ? paperById.get(match.paper_id) ?? null : null,
      })),
  }))

  return Response.json({ researchers: data, central_brain: centralBrain })
}
