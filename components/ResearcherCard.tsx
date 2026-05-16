// P2 — researcher card for /team view: name + current projects + latest matched papers.
import PaperMatchCard from "@/components/PaperMatchCard";

interface Project {
  id: string;
  title: string | null;
  content: string;
}

interface Match {
  id: string;
  relationship: string | null;
  rationale: string | null;
  papers: { title: string; authors: string[] | null; arxiv_id: string | null } | null;
}

interface Props {
  name: string;
  email: string;
  projects: Project[];
  matches: Match[];
}

export default function ResearcherCard({ name, email, projects, matches }: Props) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="bg-white/70 backdrop-blur border border-indigo-100 rounded-2xl p-5 flex flex-col gap-4 shadow-sm shadow-indigo-50">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-medium shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-sm font-medium text-indigo-950">{name}</p>
          <p className="text-xs text-indigo-300">{email}</p>
        </div>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">
            Active Projects
          </p>
          <div className="flex flex-col gap-1">
            {projects.map((p) => (
              <p key={p.id} className="text-xs text-indigo-800 leading-snug">
                {p.title ?? p.content.slice(0, 60) + "…"}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Matched papers */}
      {matches.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300 mb-1">
            Recent Papers
          </p>
          {matches.map((m) => (
            <PaperMatchCard key={m.id} {...m} />
          ))}
        </div>
      )}

      {projects.length === 0 && matches.length === 0 && (
        <p className="text-xs text-indigo-200">No shared activity yet.</p>
      )}
    </div>
  );
}
