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

interface CentralBrain {
  name: string;
  subject: string;
  state: {
    claims: {
      id: string;
      statement: string;
      status: string;
      confidence: number | null;
    }[];
    evidence: { id: string }[];
    commits: { id: string; summary: string }[];
  };
}

export default function TeamPage() {
  const router = useRouter();
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [centralBrain, setCentralBrain] = useState<CentralBrain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => {
        setResearchers(d.researchers ?? []);
        setCentralBrain(d.central_brain ?? null);
      })
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
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" />
              <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" style={{ animationDelay: "0.3s" }} />
              <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" style={{ animationDelay: "0.6s" }} />
            </div>
          </div>
        ) : researchers.length === 0 && !centralBrain ? (
          <p className="text-sm text-indigo-300">No central brain state found.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {centralBrain && (
              <section className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-indigo-300">Central GBrain</p>
                    <h2 className="text-xl font-medium text-indigo-950">{centralBrain.name}</h2>
                    <p className="text-sm text-indigo-400">{centralBrain.subject}</p>
                  </div>
                  <div className="flex gap-3 text-xs text-indigo-400">
                    <span>{centralBrain.state.claims.length} claims</span>
                    <span>{centralBrain.state.evidence.length} evidence</span>
                    <span>{centralBrain.state.commits.length} commits</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {centralBrain.state.claims.slice(0, 4).map((claim) => (
                    <article
                      key={claim.id}
                      className="rounded-lg border border-indigo-100 bg-white/70 p-4 shadow-sm shadow-indigo-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase text-indigo-300">{claim.status}</span>
                        <span className="text-xs text-indigo-300">
                          {claim.confidence == null ? "unknown" : claim.confidence.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-indigo-950">{claim.statement}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {researchers.length > 0 && (
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {researchers.map((researcher) => (
                  <ResearcherCard key={researcher.id} {...researcher} />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
