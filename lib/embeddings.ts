// P3 — Voyage AI embeddings wrapper. Model: voyage-3-lite. Dim: 1024.
// Export: embed(text: string): Promise<number[]>, embedBatch(texts: string[])

const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3"; // voyage-3-lite returns 512 dims; schema requires 1024

async function request(inputs: string[]): Promise<number[][]> {
  const res = await fetch(VOYAGE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: inputs, model: MODEL }),
  });
  if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function embed(text: string): Promise<number[]> {
  const [embedding] = await request([text]);
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  // Voyage allows up to 128 inputs per request
  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += 128) {
    chunks.push(texts.slice(i, i + 128));
  }
  const results: number[][] = [];
  for (const chunk of chunks) {
    results.push(...(await request(chunk)));
  }
  return results;
}
