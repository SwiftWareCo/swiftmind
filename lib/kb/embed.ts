import "server-only";

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

type EmbeddingVector = number[];

export async function embedChunks(texts: string[]): Promise<EmbeddingVector[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Avoid single huge payloads; batch by 64
  const batchSize = 64;
  const results: EmbeddingVector[] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const input = texts.slice(i, i + batchSize);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Embedding failed (${res.status}): ${msg.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    for (const row of json.data) results.push(row.embedding);
  }
  return results;
}


export async function embedQuery(text: string): Promise<EmbeddingVector> {
  const [embedding] = await embedChunks([text]);
  return embedding;
}


