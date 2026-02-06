import { v4 as uuidv4 } from "uuid";
import { query } from "./db";
import type { RegulationItem, RunRecord, Requirement, ReviewQueueItem, SourceDocument } from "@regpulse/ontology";

export interface RunLogEntry {
  id: string;
  run_id: string;
  stage: string;
  message: string;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface SourceDocumentRow {
  id: string;
  url: string;
  domain: string;
  title?: string | null;
  content?: string | null;
  retrieved_at: string;
  hash?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function insertSourceDocuments(documents: SourceDocument[]): Promise<void> {
  for (const doc of documents) {
    await query(
      `INSERT INTO source_documents (id, url, domain, title, content, retrieved_at, hash, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [doc.id, doc.url, doc.domain, doc.title || null, doc.content || null, doc.retrieved_at, doc.hash || null, doc.meta || null]
    );
  }
}

export async function upsertRegulationItem(item: RegulationItem): Promise<void> {
  const serializeJson = (value: unknown, fallback: unknown) => {
    if (typeof value === "string") {
      try {
        JSON.parse(value);
        return value;
      } catch {
        return JSON.stringify(fallback);
      }
    }
    return JSON.stringify(value ?? fallback);
  };

  const engineeringActionsJson = serializeJson(item.engineering_actions, []);
  const evidenceJson = serializeJson(item.evidence, {
    raw_file_uri: null,
    text_snapshot_uri: null,
    citations: []
  });

  await query(
    `INSERT INTO regulation_items
     (id, jurisdiction, source_org, source_type, title, summary_1line, url, published_date, retrieved_at, effective_date,
      status, topics, impacted_areas, engineering_actions, evidence, confidence, notes, priority, trust_tier, monitoring_stage, source_profile_id, source_document_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (id) DO UPDATE SET
      jurisdiction = EXCLUDED.jurisdiction,
      source_org = EXCLUDED.source_org,
      source_type = EXCLUDED.source_type,
      title = EXCLUDED.title,
      summary_1line = EXCLUDED.summary_1line,
      url = EXCLUDED.url,
      published_date = EXCLUDED.published_date,
      retrieved_at = EXCLUDED.retrieved_at,
      effective_date = EXCLUDED.effective_date,
      status = EXCLUDED.status,
      topics = EXCLUDED.topics,
      impacted_areas = EXCLUDED.impacted_areas,
      engineering_actions = EXCLUDED.engineering_actions,
      evidence = EXCLUDED.evidence,
      confidence = EXCLUDED.confidence,
      notes = EXCLUDED.notes,
      priority = EXCLUDED.priority,
      trust_tier = EXCLUDED.trust_tier,
      monitoring_stage = EXCLUDED.monitoring_stage,
      source_profile_id = EXCLUDED.source_profile_id,
      source_document_id = EXCLUDED.source_document_id`,
    [
      item.id,
      item.jurisdiction,
      item.source_org,
      item.source_type,
      item.title,
      item.summary_1line,
      item.url,
      item.published_date,
      item.retrieved_at,
      item.effective_date,
      item.status,
      item.topics,
      item.impacted_areas,
      engineeringActionsJson,
      evidenceJson,
      item.confidence,
      item.notes,
      item.priority,
      item.trust_tier || null,
      item.monitoring_stage || null,
      item.source_profile_id || null,
      item.source_document_id || null
    ]
  );
}

export async function insertReviewQueueItem(item: ReviewQueueItem): Promise<void> {
  await query(
    "INSERT INTO review_queue (id, entity_type, payload, reason, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [item.id, item.entity_type, item.payload, item.reason, item.status, item.created_at]
  );
}

export async function insertRunLog(runId: string, stage: string, message: string, meta?: Record<string, unknown>): Promise<void> {
  await query(
    "INSERT INTO run_logs (id, run_id, stage, message, meta) VALUES ($1, $2, $3, $4, $5)",
    [uuidv4(), runId, stage, message, meta || null]
  );
}

export async function getRunLogs(runId: string, limit = 200): Promise<RunLogEntry[]> {
  const { rows } = await query<RunLogEntry>(
    "SELECT * FROM run_logs WHERE run_id = $1 ORDER BY created_at ASC LIMIT $2",
    [runId, limit]
  );
  return rows;
}

export async function getRunDocuments(runId: string): Promise<SourceDocumentRow[]> {
  const { rows } = await query<SourceDocumentRow>(
    `SELECT sd.*
     FROM source_documents sd
     JOIN links l
       ON l.to_type = 'SourceDocument'
      AND l.to_id = sd.id
      AND l.from_type = 'Run'
      AND l.from_id = $1
     ORDER BY sd.retrieved_at DESC`,
    [runId]
  );
  return rows;
}

export async function insertRequirement(requirement: Requirement, sourceItemId?: string): Promise<string> {
  const reqId = requirement.id || uuidv4();
  await query(
    `INSERT INTO requirements
     (id, requirement_family, markets, vehicle_types, functions, owner, evidence_status, priority, source_item_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      reqId,
      requirement.requirementFamily,
      requirement.markets,
      requirement.vehicleTypes,
      requirement.functions,
      requirement.owner,
      requirement.evidenceStatus,
      requirement.priority,
      sourceItemId || null
    ]
  );
  return reqId;
}

export async function insertLink(
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  relation: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO links (id, from_type, from_id, to_type, to_id, relation, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [uuidv4(), fromType, fromId, toType, toId, relation, meta || null]
  );
}

export async function insertLinks(
  links: Array<{ fromType: string; fromId: string; toType: string; toId: string; relation: string; meta?: Record<string, unknown> }>
): Promise<void> {
  for (const link of links) {
    await insertLink(link.fromType, link.fromId, link.toType, link.toId, link.relation, link.meta);
  }
}

export function rowToItem(row: any): RegulationItem {
  return {
    id: row.id,
    jurisdiction: row.jurisdiction,
    source_org: row.source_org,
    source_type: row.source_type,
    title: row.title,
    summary_1line: row.summary_1line,
    url: row.url,
    published_date: row.published_date,
    retrieved_at: row.retrieved_at,
    effective_date: row.effective_date,
    status: row.status,
    topics: row.topics || [],
    impacted_areas: row.impacted_areas || [],
    engineering_actions: row.engineering_actions || [],
    evidence: row.evidence || { raw_file_uri: null, text_snapshot_uri: null, citations: [] },
    confidence: Number(row.confidence ?? 0.7),
    notes: row.notes || "",
    priority: row.priority,
    trust_tier: row.trust_tier || undefined,
    monitoring_stage: row.monitoring_stage || undefined,
    source_profile_id: row.source_profile_id || undefined,
    source_document_id: row.source_document_id || undefined
  } as RegulationItem;
}

export function rowToRun(row: any): RunRecord {
  return {
    id: row.id,
    run_type: row.run_type,
    jurisdiction: row.jurisdiction,
    days_window: row.days_window,
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    meta: row.meta || undefined,
    job_id: row.job_id || undefined
  } as RunRecord;
}
