import { v4 as uuidv4 } from "uuid";
import { createOpenAIClient } from "./openai";
import type { SourceDocument } from "@regpulse/ontology";
import { query } from "../db";

export async function vectorizeDocuments(documents: SourceDocument[]): Promise<number> {
  if (documents.length === 0) return 0;

  const client = createOpenAIClient();
  const storeId = await ensureLocalVectorStore();
  let count = 0;

  for (const doc of documents) {
    const input = [doc.title, doc.content].filter(Boolean).join("\n\n").slice(0, 6000);
    if (!input) continue;

    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input
    });

    const embedding = response.data[0].embedding;
    const vectorLiteral = `[${embedding.join(",")}]`;
    await query(
      `INSERT INTO vector_chunks (id, document_id, chunk_index, text, embedding, vector_store_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), doc.id, 0, input, vectorLiteral, storeId]
    );
    count += 1;
  }

  return count;
}

async function ensureLocalVectorStore(): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM vector_stores WHERE provider = 'local' ORDER BY created_at LIMIT 1"
  );
  if (rows.length > 0) {
    return rows[0].id;
  }

  const id = uuidv4();
  await query(
    "INSERT INTO vector_stores (id, name, provider, status) VALUES ($1, $2, $3, $4)",
    [id, "Local Vector Store", "local", "active"]
  );
  return id;
}
