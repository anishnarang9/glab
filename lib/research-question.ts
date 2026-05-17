export type ResearchQuestionEvidence = {
  id: string
  source_kind: string
  source_ref: string | null
  title: string | null
  content: string
  url: string | null
  published_at: string | null
  created_at: string
  embedding: unknown
}

export function buildResearchQuestion(evidence: Pick<ResearchQuestionEvidence, 'title' | 'content' | 'source_kind'>): string {
  const subject = cleanSubject(evidence.title) || cleanSubject(evidence.content) || 'this new research item'

  if (evidence.source_kind === 'arxiv_query') {
    return `How does ${subject} change or challenge the lab's current research direction?`
  }

  if (evidence.source_kind === 'hog_news') {
    return `Is ${subject} relevant enough to affect the lab's research roadmap, or should OpenClaw treat it as background signal?`
  }

  return `What claim should the Central GBrain update after reading ${subject}?`
}

export function evidenceHasEmbedding(evidence: Pick<ResearchQuestionEvidence, 'embedding'>): boolean {
  return evidence.embedding != null
}

function cleanSubject(value: string | null): string {
  if (!value) return ''
  return value
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/, '')
    .trim()
    .slice(0, 180)
}
