// P2 — landing + demo-user picker
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import NeuralBackground from "@/components/NeuralBackground";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [firing, setFiring] = useState(false);
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setFiring(true);
    setTimeout(() => {
      router.push(`/onboard?q=${encodeURIComponent(q)}`);
    }, 400);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <NeuralBackground />

      <div className="w-full max-w-2xl flex flex-col items-center gap-8 relative z-10">
        {/* Logo / title */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-medium tracking-tight text-indigo-950">
              LabBrain
            </h1>
          </div>
          <p className="text-sm text-indigo-400 font-light">
            Your lab&apos;s collective memory
          </p>
          <button
            onClick={() => router.push("/team")}
            className="text-xs text-indigo-300 hover:text-indigo-600 transition"
          >
            View team →
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="relative w-full flex items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What is the lab currently working on?"
              className="w-full pl-4 pr-20 py-3 rounded-xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm shadow-indigo-100 text-indigo-950 placeholder:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm transition"
              autoFocus
            />

            {/* Fire animation bar */}
            {firing && (
              <span
                className="absolute left-4 right-20 h-px bg-indigo-400 top-1/2 -translate-y-1/2 z-20 pointer-events-none"
                style={{ animation: "fire 0.35s ease-out forwards" }}
              />
            )}

            <button
              type="submit"
              disabled={!query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-30 hover:bg-indigo-700 transition"
            >
              Ask
            </button>
          </div>
        </form>

        {/* Example chips */}
        <div className="flex gap-3 flex-wrap justify-center">
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => setQuery(q)}
              className="px-3 py-1.5 rounded-full border border-indigo-100 text-indigo-300 text-xs hover:border-indigo-300 hover:text-indigo-600 bg-white/50 transition"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

const EXAMPLE_QUERIES = [
  "Who is working on diffusion models?",
  "What papers has the lab published recently?",
  "What are the active projects?",
];
