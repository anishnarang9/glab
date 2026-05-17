import { ensureDefaultBrain } from '@/lib/brain'
import { buildResearchQuestion, evidenceHasEmbedding, pickBestResearchEvidence, type ResearchQuestionEvidence } from '@/lib/research-question'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const RESEARCH_SOURCE_KINDS = ['arxiv_query', 'web_page', 'hog_news']

export async function GET() {
  try {
    const brain = await ensureDefaultBrain()
    const { data, error } = await supabaseAdmin()
      .from('evidence_items')
      .select('id, source_kind, source_ref, title, content, url, published_at, created_at, embedding')
      .eq('brain_id', brain.id)
      .in('source_kind', RESEARCH_SOURCE_KINDS)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const evidence = pickBestResearchEvidence(data as ResearchQuestionEvidence[])
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
      candidates_considered: data.length,
    })
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503 })
  }
}
