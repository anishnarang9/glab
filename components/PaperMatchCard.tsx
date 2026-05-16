// P2 — single paper-match card: paper title + relationship label + rationale.

const RELATIONSHIP_STYLES: Record<string, { label: string; color: string }> = {
  validates:       { label: "Validates",       color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  extends:         { label: "Extends",         color: "bg-blue-50 text-blue-700 border-blue-100" },
  suggests_change: { label: "Suggests change", color: "bg-amber-50 text-amber-700 border-amber-100" },
  scoops:          { label: "Scoops",          color: "bg-red-50 text-red-700 border-red-100" },
  orthogonal:      { label: "Orthogonal",      color: "bg-stone-50 text-stone-500 border-stone-100" },
};

interface Paper {
  title: string;
  authors: string[] | null;
  arxiv_id: string | null;
}

interface Props {
  relationship: string | null;
  rationale: string | null;
  papers: Paper | null;
}

export default function PaperMatchCard({ relationship, rationale, papers }: Props) {
  if (!papers) return null;
  const style = RELATIONSHIP_STYLES[relationship ?? "orthogonal"] ?? RELATIONSHIP_STYLES.orthogonal;

  return (
    <div className="flex flex-col gap-1 py-2 border-t border-indigo-50 first:border-0">
      <div className="flex items-start gap-2">
        <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${style.color}`}>
          {style.label}
        </span>
        <p className="text-xs text-indigo-900 font-medium leading-snug">{papers.title}</p>
      </div>
      {rationale && (
        <p className="text-xs text-indigo-400 leading-relaxed pl-0.5">{rationale}</p>
      )}
    </div>
  );
}
