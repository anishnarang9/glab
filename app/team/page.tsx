// P2 — /team route. SSR list of researchers with current projects + latest matched papers.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NeuralBackground from "@/components/NeuralBackground";
import ResearcherCard from "@/components/ResearcherCard";

interface Researcher {
  id: string;
  name: string;
  email: string;
  projects: { id: string; title: string | null; content: string }[];
  matches: {
    id: string;
    relationship: string | null;
    rationale: string | null;
    papers: { title: string; authors: string[] | null; arxiv_id: string | null } | null;
  }[];
}

export default function TeamPage() {
  const router = useRouter();
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => setResearchers(d.researchers ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden">
      <NeuralBackground />

      <header className="sticky top-0 z-10 bg-[#f7f6ff]/80 backdrop-blur border-b border-indigo-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-indigo-300 hover:text-indigo-600 text-sm transition flex items-center gap-1.5"
        >
          ← <span className="text-indigo-950 font-medium">LabBrain</span>
        </button>
        <span className="text-indigo-200">·</span>
        <span className="text-sm text-indigo-950 font-medium">Team</span>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto px-6 py-10 relative z-10">
        {loading ? (
          <div className="flex items-center gap-2 text-indigo-300 text-sm">
            <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" />
            <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" style={{ animationDelay: "0.3s" }} />
            <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" style={{ animationDelay: "0.6s" }} />
          </div>
        ) : researchers.length === 0 ? (
          <p className="text-sm text-indigo-300">No researchers found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {researchers.map((r) => (
              <ResearcherCard key={r.id} {...r} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
