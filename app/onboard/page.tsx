// P2 — /onboard route. Text input → streaming Q&A UI. Uses lib/anthropic.ts streamChat.
"use client";

import { useState, FormEvent, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import NeuralBackground from "@/components/NeuralBackground";

function stripCitations(text: string): string {
  return text.replace(/\s*\[(artifact|claim|evidence|artifact):[a-f0-9-]+\]/g, "");
}

function OnboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialQuery) {
      runQuery(initialQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runQuery(q: string) {
    setQuery(q);
    setResponse("");
    setLoading(true);

    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok || !res.body) throw new Error("Failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResponse((prev) => prev + decoder.decode(value, { stream: true }));
        responseRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    } catch {
      setResponse("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setInput("");
    runQuery(q);
  }

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden">
      <NeuralBackground />

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#f7f6ff]/80 backdrop-blur border-b border-indigo-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-indigo-300 hover:text-indigo-600 text-sm transition flex items-center gap-1.5"
        >
          ← <span className="text-indigo-950 font-medium">LabBrain</span>
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8 relative z-10">
        {query && (
          <div className="flex flex-col gap-6">
            <p className="text-lg font-medium text-indigo-950">{query}</p>

            <div ref={responseRef} className="min-h-[4rem]">
              {loading && !response && (
                <span className="inline-flex gap-1.5 items-center">
                  <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" />
                  <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" style={{ animationDelay: "0.3s" }} />
                  <span className="synapse-dot w-1.5 h-1.5 rounded-full bg-indigo-400 block" style={{ animationDelay: "0.6s" }} />
                </span>
              )}
              {response && (
                <div className="prose prose-sm prose-indigo max-w-none
                  prose-headings:font-semibold prose-headings:text-indigo-950
                  prose-p:text-indigo-800 prose-p:leading-relaxed
                  prose-li:text-indigo-800 prose-strong:text-indigo-950
                  prose-hr:border-indigo-100">
                  <ReactMarkdown>{stripCitations(response)}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Follow-up input */}
      <div className="sticky bottom-0 z-10 bg-[#f7f6ff]/80 backdrop-blur border-t border-indigo-100 px-4 py-4">
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up..."
            disabled={loading}
            className="w-full pl-4 pr-20 py-3 rounded-xl border border-indigo-100 bg-white/80 backdrop-blur shadow-sm shadow-indigo-100 text-indigo-950 placeholder:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-30 hover:bg-indigo-700 transition"
          >
            Ask
          </button>
        </form>
      </div>
    </main>
  );
}

export default function OnboardPage() {
  return (
    <Suspense>
      <OnboardContent />
    </Suspense>
  );
}
