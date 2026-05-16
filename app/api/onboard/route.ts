// P2 — HTTP handler. Embed question → pgvector top-K shared artifacts → stream Anthropic response.
// TODO: once P3 merges lib/embeddings.ts + lib/anthropic.ts, replace embedQuestion() and
//       the Anthropic block with: embed(question) and streamChat(messages)

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

async function embedQuestion(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: "voyage-3-lite" }),
  });
  if (!res.ok) throw new Error(`Voyage error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding as number[];
}

export async function POST(req: Request) {
  const { question } = await req.json();
  if (!question?.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  // Step 1: embed the question
  const embedding = await embedQuestion(question);

  // Step 2: pgvector top-10 cosine search over shared artifacts
  const supabase = supabaseAdmin();
  const { data: artifacts, error } = await supabase.rpc("match_artifacts", {
    query_embedding: embedding,
    match_count: 10,
  });

  if (error) {
    console.error("match_artifacts rpc error:", error);
    return Response.json({ error: "Vector search failed" }, { status: 500 });
  }

  const context =
    artifacts && artifacts.length > 0
      ? artifacts
          .map(
            (a: { id: string; type: string; title: string | null; content: string }) =>
              `[artifact:${a.id}]\nType: ${a.type}\nTitle: ${a.title ?? "Untitled"}\n${a.content}`
          )
          .join("\n\n---\n\n")
      : "No shared artifacts found yet.";

  // Step 3: stream Anthropic response
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a research-lab knowledge assistant. The user asks a question about the lab.
Below are the most relevant lab artifacts (project descriptions, notes, papers, findings).
Cite specific artifacts by ID when answering. If the artifacts don't contain the answer, say so — don't invent.

QUESTION: ${question}

ARTIFACTS:
${context}

Answer concisely. Cite [artifact:id] inline.`;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(enc.encode("Error generating response."));
        console.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
