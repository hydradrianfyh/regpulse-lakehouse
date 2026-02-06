import { v4 as uuidv4 } from "uuid";
import { createOpenAIClient } from "./openai";
import type { SourceDocument } from "@regpulse/ontology";
import { query } from "../db";

const CHUNK_SIZE = 3000;
const CHUNK_OVERLAP = 300;
const MAX_CHUNKS = 30;
const MIN_CHUNK = 300;

export async function vectorizeDocuments(documents: SourceDocument[]): Promise<number> {
  if (documents.length === 0) return 0;

  const client = createOpenAIClient();
  const storeId = await ensureLocalVectorStore();
  let count = 0;

  for (const doc of documents) {
    const input = [doc.title, doc.content].filter(Boolean).join("\n\n").trim();
    if (!input) continue;

    const chunks = splitIntoChunks(input);
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      if (!chunk) continue;

      const response = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk
      });

      const embedding = response.data[0].embedding;
      const vectorLiteral = `[${embedding.join(",")}]`;
      await query(
        `INSERT INTO vector_chunks (id, document_id, chunk_index, text, embedding, vector_store_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), doc.id, i, chunk, vectorLiteral, storeId]
      );
      count += 1;
    }
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

function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const paragraph of paragraphs) {
    if (chunks.length >= MAX_CHUNKS) break;

    if (paragraph.length > CHUNK_SIZE) {
      if (current) {
        pushCurrent(current);
        current = "";
      }
      const step = Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP);
      for (let start = 0; start < paragraph.length; start += step) {
        const end = Math.min(start + CHUNK_SIZE, paragraph.length);
        const slice = paragraph.slice(start, end).trim();
        if (slice) chunks.push(slice);
        if (chunks.length >= MAX_CHUNKS || end >= paragraph.length) break;
      }
      continue;
    }

    if (!current) {
      current = paragraph;
      continue;
    }

    const candidateLength = current.length + 2 + paragraph.length;
    if (candidateLength <= CHUNK_SIZE) {
      current = `${current}\n\n${paragraph}`;
    } else {
      const prev = current;
      pushCurrent(prev);
      if (chunks.length >= MAX_CHUNKS) {
        current = "";
        break;
      }
      const tail = CHUNK_OVERLAP > 0
        ? prev.slice(Math.max(0, prev.length - CHUNK_OVERLAP))
        : "";
      current = tail ? `${tail}\n\n${paragraph}` : paragraph;
    }
  }

  if (current && chunks.length < MAX_CHUNKS) {
    pushCurrent(current);
  }

  let filtered = chunks.filter((chunk) => chunk.length >= MIN_CHUNK);
  if (filtered.length === 0 && chunks.length > 0) {
    filtered = [chunks[0]];
  }
  if (filtered.length > MAX_CHUNKS) {
    filtered = filtered.slice(0, MAX_CHUNKS);
  }
  return filtered;
}
