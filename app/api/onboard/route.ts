// P2 — HTTP handler. Embed question → pgvector top-K shared artifacts → stream Anthropic response.
// TODO: replace stub with real embed() + supabaseAdmin() vector search + streamChat()
export async function POST(req: Request) {
  const { question } = await req.json();

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      // Stub: echoes the question back so the UI flow is testable end-to-end.
      // Replace this with: embed(question) → pgvector search → streamChat(messages)
      const msg = `[Stub] You asked: "${question}"\n\nThe real response will stream here once lib/embeddings.ts and lib/anthropic.ts are wired in.`;
      controller.enqueue(enc.encode(msg));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
