import { ensureDefaultBrain, ensureEvidenceEmbedding } from '@/lib/brain'
import { buildResearchQuestion, evidenceHasEmbedding, pickBestResearchEvidence, type ResearchQuestionEvidence } from '@/lib/research-question'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const RESEARCH_SOURCE_KINDS = ['arxiv_query', 'web_page', 'hog_news']
const PRIMARY_RESEARCH_SOURCE_KINDS = ['arxiv_query', 'web_page']

export async function GET() {
  try {
    const brain = await ensureDefaultBrain()
    const primary = await loadEvidenceCandidates(brain.id, PRIMARY_RESEARCH_SOURCE_KINDS)
    const fallback = primary.length > 0 ? [] : await loadEvidenceCandidates(brain.id, RESEARCH_SOURCE_KINDS)
    const candidates = primary.length > 0 ? primary : fallback

    const selected = pickBestResearchEvidence(candidates)
    const evidence = selected ? await ensureEvidenceEmbedding(selected) : null
    if (!evidence) {
      return Response.json({
        ok: false,
        reason: 'no_research_evidence',
        question: null,
        evidence: null,
      }, { status: 404 })
    }

    return Response.json({
      ok: true,
      question: buildResearchQuestion(evidence),
      evidence: {
        id: evidence.id,
        source_kind: evidence.source_kind,
        source_ref: evidence.source_ref,
        title: evidence.title,
        url: evidence.url,
        published_at: evidence.published_at,
        created_at: evidence.created_at,
        embedding_present: evidenceHasEmbedding(evidence),
      },
      candidates_considered: candidates.length,
    })
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503 })
  }
}

async function loadEvidenceCandidates(brainId: string, sourceKinds: string[]): Promise<ResearchQuestionEvidence[]> {
  const { data, error } = await supabaseAdmin()
    .from('evidence_items')
    .select('id, source_kind, source_ref, title, content, url, published_at, created_at, embedding')
    .eq('brain_id', brainId)
    .in('source_kind', sourceKinds)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data as ResearchQuestionEvidence[]
}
