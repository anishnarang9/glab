// Central GBrain Q&A. Reads shared truth, evidence, and commits maintained by OpenClaw.

import Anthropic from "@anthropic-ai/sdk";
import { ensureDefaultBrain } from "@/lib/brain";
import { buildTruthContext, loadCentralBrainState } from "@/lib/brain-state";

export async function POST(req: Request) {
  const { question } = await req.json();
  if (!question?.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const brain = await ensureDefaultBrain();
  const state = await loadCentralBrainState({
    brainId: brain.id,
    claims: 18,
    evidence: 18,
    commits: 8,
  });
  const context = buildTruthContext(state);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a research-lab knowledge assistant. The user asks a question about the lab.
Below is the Central GBrain shared state maintained by OpenClaw: truth claims, recent evidence, and brain commits.
Cite specific claims, evidence, or commits by ID when answering. If the Central GBrain state does not contain the answer, say so; do not invent.

QUESTION: ${question}

CENTRAL GBRAIN STATE:
${context}

Answer concisely. Cite [claim:id], [evidence:id], or [commit:id] inline.`;

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
