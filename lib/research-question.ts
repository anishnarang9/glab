import type { StoredEmbedding } from '@/lib/embedding-storage'

export type ResearchQuestionEvidence = {
  id: string
  source_kind: string
  source_ref: string | null
  title: string | null
  content: string
  url: string | null
  published_at: string | null
  created_at: string
  embedding: StoredEmbedding
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

export function pickBestResearchEvidence(evidence: ResearchQuestionEvidence[]): ResearchQuestionEvidence | null {
  return [...evidence].sort((left, right) => evidenceScore(right) - evidenceScore(left))[0] ?? null
}

function evidenceScore(evidence: ResearchQuestionEvidence): number {
  const sourceScore =
    evidence.source_kind === 'arxiv_query' ? 300 :
    evidence.source_kind === 'web_page' ? 200 :
    100
  const embeddingScore = evidenceHasEmbedding(evidence) ? 50 : 0
  return sourceScore + embeddingScore + labRelevanceScore(evidence) + Date.parse(evidence.created_at) / 1_000_000_000_000
}

function labRelevanceScore(evidence: Pick<ResearchQuestionEvidence, 'title' | 'content'>): number {
  const text = `${evidence.title ?? ''} ${evidence.content}`.toLowerCase()
  const matches = [
    'neuroscience',
    'neural',
    'neuron',
    'brain',
    'fmri',
    'cortex',
    'cortical',
    'visual',
    'vision',
    'decoding',
    'connectome',
    'connectomics',
    'bci',
    'motor',
    'population dynamics',
    'computational neuroscience',
  ].filter((term) => text.includes(term)).length

  return Math.min(matches, 4) * 150
}

function cleanSubject(value: string | null): string {
  if (!value) return ''
  return value
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/, '')
    .trim()
    .slice(0, 180)
}
