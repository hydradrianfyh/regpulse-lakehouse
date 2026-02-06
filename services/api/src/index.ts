
import "dotenv/config";
import Fastify from "fastify";
import { v4 as uuidv4 } from "uuid";
import { createReadStream } from "node:fs";
import path from "node:path";
import { initDb, query } from "./db";
import { createOpenAIClient, getModel } from "./services/openai";
import { enqueueMergeJob, enqueueScanJob } from "./queue";
import {
  ALLOWED_DOMAINS,
  JURISDICTIONS,
  SOURCE_TYPES,
  ITEM_STATUSES,
  TOPICS,
  IMPACTED_AREAS,
  PRIORITIES,
  TRUST_TIERS,
  MONITORING_STAGES,
  RegulationItemSchema
} from "@regpulse/ontology";
import type { RegulationItem, ReviewQueueItem } from "@regpulse/ontology";
import { buildLineageGraph } from "./lineage";
import { rowToItem, rowToRun, upsertRegulationItem, insertLink, getRunLogs, getRunDocuments } from "./repository";
import { getRuntimeConfig, loadRuntimeConfig, setRuntimeConfig } from "./config/runtime";
import { getStoredFilePath } from "./storage/object-store";

const app = Fastify({ logger: true });

app.addHook("onRequest", async (req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    reply.code(204);
    return reply.send();
  }
});

app.get("/api/health", async () => ({ status: "ok" }));

app.get("/api/config", async () => {
  await loadRuntimeConfig();
  const cfg = getRuntimeConfig();
  return {
    openai_configured: Boolean(cfg.openai_api_key),
    allowed_domains: ALLOWED_DOMAINS,
    reasoning_effort: cfg.reasoning_effort,
    confidence_min: cfg.confidence_min,
    openai_model: cfg.openai_model
  };
});

app.post("/api/config", async (req, reply) => {
  const body = (req.body || {}) as {
    openai_api_key?: string;
    openai_model?: string;
    reasoning_effort?: "low" | "medium" | "high";
    confidence_min?: number;
  };

  const update: {
    openai_api_key?: string;
    openai_model?: string;
    reasoning_effort?: "low" | "medium" | "high";
    confidence_min?: number;
  } = {};

  if (typeof body.openai_api_key === "string") {
    update.openai_api_key = body.openai_api_key.trim();
  }
  if (typeof body.openai_model === "string" && body.openai_model.trim()) {
    update.openai_model = body.openai_model.trim();
  }
  if (body.reasoning_effort === "low" || body.reasoning_effort === "medium" || body.reasoning_effort === "high") {
    update.reasoning_effort = body.reasoning_effort;
  }
  if (typeof body.confidence_min === "number" && Number.isFinite(body.confidence_min)) {
    if (body.confidence_min < 0 || body.confidence_min > 1) {
      reply.code(400);
      return { error: "confidence_min must be between 0 and 1" };
    }
    update.confidence_min = body.confidence_min;
  }

  if (Object.keys(update).length === 0) {
    reply.code(400);
    return { error: "No valid config fields provided" };
  }

  await setRuntimeConfig(update);
  const cfg = getRuntimeConfig();
  return {
    openai_configured: Boolean(cfg.openai_api_key),
    allowed_domains: ALLOWED_DOMAINS,
    reasoning_effort: cfg.reasoning_effort,
    confidence_min: cfg.confidence_min,
    openai_model: cfg.openai_model
  };
});

app.get("/api/ontology", async () => ({
  jurisdictions: JURISDICTIONS,
  source_types: SOURCE_TYPES,
  statuses: ITEM_STATUSES,
  topics: TOPICS,
  impacted_areas: IMPACTED_AREAS,
  priorities: PRIORITIES,
  trust_tiers: TRUST_TIERS,
  monitoring_stages: MONITORING_STAGES,
  allowed_domains: ALLOWED_DOMAINS
}));

app.get("/api/vector-stores", async () => {
  const { rows } = await query<any>(
    "SELECT * FROM vector_stores ORDER BY created_at DESC"
  );
  return { stores: rows };
});

app.get("/api/openai/vector-stores", async (req, reply) => {
  let client;
  try {
    client = createOpenAIClient();
  } catch {
    reply.code(400);
    return { error: "OpenAI API key not configured" };
  }

  try {
    const page = await client.vectorStores.list({ limit: 50 });
    const stores = page.data.map((store) => ({
      id: store.id,
      name: store.name,
      status: store.status,
      usage_bytes: store.usage_bytes,
      file_counts: store.file_counts,
      created_at: store.created_at,
      last_active_at: store.last_active_at
    }));
    return { stores };
  } catch (error) {
    reply.code(502);
    return { error: error instanceof Error ? error.message : "Failed to list vector stores" };
  }
});

app.post("/api/vector-stores", async (req, reply) => {
  const body = req.body as { name: string; provider: string; external_id?: string; meta?: Record<string, unknown> };
  if (!body?.name || !body?.provider) {
    reply.code(400);
    return { error: "Missing name or provider" };
  }

  const id = uuidv4();
  await query(
    "INSERT INTO vector_stores (id, name, provider, external_id, status, meta) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, body.name, body.provider, body.external_id || null, "active", body.meta || null]
  );
  return { id };
});

app.delete("/api/vector-stores/:id", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const { rows } = await query<any>("SELECT provider FROM vector_stores WHERE id = $1", [id]);
  if (rows.length === 0) {
    reply.code(404);
    return { error: "Vector store not found" };
  }
  if (rows[0].provider === "local") {
    reply.code(400);
    return { error: "Local store cannot be deleted" };
  }
  await query("DELETE FROM vector_stores WHERE id = $1", [id]);
  return { status: "deleted" };
});

app.get("/api/vector-store/stats", async () => {
  const { rows } = await query<any>(
    "SELECT COUNT(*)::int AS total_chunks, COUNT(DISTINCT document_id)::int AS documents, MAX(created_at) AS last_ingested_at FROM vector_chunks"
  );
  const stats = rows[0] || { total_chunks: 0, documents: 0, last_ingested_at: null };
  return { stats };
});

app.get("/api/vector-store/documents", async () => {
  const { rows } = await query<any>(
    `SELECT d.id, d.title, d.url, d.domain,
            COUNT(vc.id)::int AS chunk_count,
            MAX(vc.created_at) AS last_ingested_at
     FROM vector_chunks vc
     JOIN source_documents d ON d.id = vc.document_id
     GROUP BY d.id, d.title, d.url, d.domain
     ORDER BY last_ingested_at DESC`
  );
  return { documents: rows };
});

app.delete("/api/vector-store/documents/:id", async (req) => {
  const id = (req.params as { id: string }).id;
  await query("DELETE FROM vector_chunks WHERE document_id = $1", [id]);
  return { status: "deleted" };
});

app.post("/api/vector-store/clear", async () => {
  await query("DELETE FROM vector_chunks");
  return { status: "cleared" };
});

app.get("/api/lineage", async () => {
  return buildLineageGraph();
});

app.get("/api/items", async () => {
  const { rows } = await query<any>(
    "SELECT * FROM regulation_items ORDER BY created_at DESC"
  );
  const items = rows.map(rowToItem);
  return { items };
});

app.get("/api/runs", async () => {
  const { rows } = await query<any>(
    "SELECT * FROM runs ORDER BY started_at DESC"
  );
  const runs = rows.map(rowToRun);
  return { runs };
});

app.get("/api/runs/:id/logs", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  if (!id) {
    reply.code(400);
    return { error: "Missing run id" };
  }
  const logs = await getRunLogs(id, 500);
  return { logs };
});

app.get("/api/runs/:id/documents", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  if (!id) {
    reply.code(400);
    return { error: "Missing run id" };
  }
  const documents = await getRunDocuments(id);
  return { documents };
});

app.get("/api/files/:id", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  if (!id) {
    reply.code(400);
    return { error: "Missing file id" };
  }
  try {
    const filePath = await getStoredFilePath(id);
    const ext = path.extname(filePath).replace(".", "").toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
    const mime = mimeMap[ext] || "application/octet-stream";
    reply.header("Content-Type", mime);
    reply.header("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    return reply.send(createReadStream(filePath));
  } catch {
    reply.code(404);
    return { error: "File not found" };
  }
});

app.get("/api/review-queue", async () => {
  const { rows } = await query<any>(
    "SELECT * FROM review_queue ORDER BY created_at DESC"
  );
  return { items: rows };
});
app.post("/api/review-queue/:id/approve", async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const { rows } = await query<any>("SELECT * FROM review_queue WHERE id = $1", [id]);
  if (rows.length === 0) {
    reply.code(404);
    return { error: "Review item not found" };
  }

  const item = rows[0] as ReviewQueueItem & { payload: RegulationItem };
  if (item.status !== "pending") {
    return { status: item.status };
  }

  if (item.entity_type === "RegulationItem") {
    const normalized = normalizeRegulationPayload(item.payload);
    const parsed = RegulationItemSchema.safeParse(normalized);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: "Invalid review payload",
        details: parsed.error.errors.map((e) => e.message)
      };
    }
    await upsertRegulationItem(parsed.data);
    if (parsed.data.source_document_id) {
      await insertLink(
        "SourceDocument",
        parsed.data.source_document_id,
        "RegulationItem",
        parsed.data.id,
        "extracted_from"
      );
    }
    await insertLink(
      "ReviewQueueItem",
      item.id,
      "RegulationItem",
      parsed.data.id,
      "approved_into_main"
    );
  }

  await query(
    "UPDATE review_queue SET status = 'approved', reviewed_at = NOW() WHERE id = $1",
    [id]
  );

  return { status: "approved" };
});

app.post("/api/review-queue/:id/reject", async (req) => {
  const id = (req.params as { id: string }).id;
  await query(
    "UPDATE review_queue SET status = 'rejected', reviewed_at = NOW() WHERE id = $1",
    [id]
  );
  return { status: "rejected" };
});

app.post("/api/evidence/verify", async (req) => {
  const body = req.body as { item?: RegulationItem };
  if (!body?.item) {
    return { success: false, message: "Missing item payload" };
  }

  let client;
  try {
    client = createOpenAIClient();
  } catch {
    return { success: false, message: "OpenAI API key not configured" };
  }
  const model = getModel();

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are a regulatory auditor. Verify evidence chain consistency.
Check:
1) URL credibility
2) Title and summary alignment
3) Topics match content
4) Actions are reasonable
Respond in Chinese with:
- 验证结果：通过/不通过
- 置信度评分：0-100
- 详细说明：...`
      },
      {
        role: "user",
        content: `请验证此法规条目：
标题: ${body.item.title}
来源: ${body.item.source_org}
URL: ${body.item.url}
摘要: ${body.item.summary_1line}
状态: ${body.item.status}
主题: ${body.item.topics.join(", ")}
影响领域: ${body.item.impacted_areas.join(", ")}
工程动作: ${body.item.engineering_actions.map(a => a.action).join("; ")}
原始置信度: ${Math.round(body.item.confidence * 100)}%`
      }
    ],
    max_completion_tokens: 500
  });

  const content = response.choices[0]?.message?.content || "";
  const isPass = content.includes("通过") && !content.includes("不通过");

  return {
    success: isPass,
    message: isPass ? "证据链验证通过" : "证据链存在问题",
    details: content
  };
});

app.post("/api/runs/scan", async (req) => {
  const body = req.body as { jurisdiction: string; days: number; query?: string; max_results?: number };
  const runId = uuidv4();
  const now = new Date().toISOString();

  await query(
    "INSERT INTO runs (id, run_type, jurisdiction, days_window, status, started_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [runId, "scan", body.jurisdiction, body.days, "queued", now]
  );

  const job = await enqueueScanJob({
    runId,
    jurisdiction: body.jurisdiction,
    days: body.days,
    query: body.query,
    max_results: body.max_results
  });

  await query("UPDATE runs SET job_id = $1 WHERE id = $2", [job.id, runId]);

  const run = await getRun(runId);
  return { run, job_id: job.id, queue: "scan" };
});
app.post("/api/runs/merge", async (req) => {
  const body = req.body as { jurisdiction: string; enable_file_search?: boolean; vector_store_id?: string };
  const runId = uuidv4();
  const now = new Date().toISOString();

  await query(
    "INSERT INTO runs (id, run_type, jurisdiction, days_window, status, started_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [runId, "merge", body.jurisdiction, 0, "queued", now]
  );

  const job = await enqueueMergeJob({
    runId,
    jurisdiction: body.jurisdiction,
    enable_file_search: body.enable_file_search,
    vector_store_id: body.vector_store_id
  });

  await query("UPDATE runs SET job_id = $1 WHERE id = $2", [job.id, runId]);

  const run = await getRun(runId);
  return { run, job_id: job.id, queue: "merge" };
});

app.post("/api/admin/clear", async () => {
  await query("TRUNCATE regulation_items, requirements, evidence, runs, review_queue, source_documents, vector_chunks, links RESTART IDENTITY");
  return { status: "cleared" };
});

async function getRun(id: string) {
  const { rows } = await query<any>("SELECT * FROM runs WHERE id = $1", [id]);
  return rowToRun(rows[0]);
}

async function start() {
  await initDb();
  await loadRuntimeConfig();
  const port = Number(process.env.PORT || 8080);
  await app.listen({ port, host: "0.0.0.0" });
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

function normalizeRegulationPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const raw = payload as Record<string, unknown>;
  const clone: Record<string, unknown> = { ...raw };

  const normalizeArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  };

  const normalizeEnum = (value: unknown, allowed: readonly string[], fallback: string) => {
    if (typeof value === "string" && allowed.includes(value)) return value;
    return fallback;
  };

  const topics = normalizeArray(raw.topics).filter((v) => TOPICS.includes(v as any));
  const impacted = normalizeArray(raw.impacted_areas).filter((v) => IMPACTED_AREAS.includes(v as any));

  clone.id = clone.id || uuidv4();
  clone.jurisdiction = normalizeEnum(raw.jurisdiction, JURISDICTIONS, "EU");
  clone.source_type = normalizeEnum(raw.source_type, SOURCE_TYPES, "guidance");
  clone.status = normalizeEnum(raw.status, ITEM_STATUSES, "unknown");
  clone.priority = normalizeEnum(raw.priority, PRIORITIES, "P2");
  clone.trust_tier = raw.trust_tier && TRUST_TIERS.includes(raw.trust_tier as any) ? raw.trust_tier : undefined;
  clone.monitoring_stage = raw.monitoring_stage && MONITORING_STAGES.includes(raw.monitoring_stage as any) ? raw.monitoring_stage : undefined;
  clone.source_profile_id = typeof raw.source_profile_id === "string" ? raw.source_profile_id : undefined;

  clone.topics = topics;
  clone.impacted_areas = impacted;
  clone.engineering_actions = Array.isArray(raw.engineering_actions) ? raw.engineering_actions : [];

  const evidence = (raw.evidence && typeof raw.evidence === "object")
    ? raw.evidence as Record<string, unknown>
    : { raw_file_uri: null, text_snapshot_uri: null, citations: [] };

  if (!Array.isArray((evidence as any).citations)) {
    (evidence as any).citations = [];
  }

  clone.evidence = evidence;

  if (!clone.url && Array.isArray((evidence as any).citations) && (evidence as any).citations[0]?.url) {
    clone.url = (evidence as any).citations[0].url;
  }

  clone.source_org = typeof raw.source_org === "string" && raw.source_org.trim() ? raw.source_org : "Unknown";
  clone.title = typeof raw.title === "string" && raw.title.trim() ? raw.title : (typeof raw.summary_1line === "string" ? raw.summary_1line : "Untitled");
  clone.summary_1line = typeof raw.summary_1line === "string" && raw.summary_1line.trim()
    ? String(raw.summary_1line).slice(0, 400)
    : String(clone.title).slice(0, 400);

  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.7;
  clone.confidence = Math.max(0, Math.min(1, confidence));

  if (!clone.retrieved_at) clone.retrieved_at = new Date().toISOString();
  if (!clone.published_date) clone.published_date = null;
  if (!clone.effective_date) clone.effective_date = null;
  if (!clone.notes) clone.notes = "";

  return clone;
}
