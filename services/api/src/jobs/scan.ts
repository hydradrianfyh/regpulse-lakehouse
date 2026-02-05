import { v4 as uuidv4 } from "uuid";
import { runScan } from "../services/scan";
import { vectorizeDocuments } from "../services/vectorize";
import { validateRegulationItem } from "../ontology/validator";
import type { RegulationItem, ReviewQueueItem, SourceDocument } from "@regpulse/ontology";
import { query } from "../db";
import { insertLinks, insertReviewQueueItem, insertSourceDocuments, upsertRegulationItem, insertRunLog } from "../repository";
import { loadRuntimeConfig } from "../config/runtime";

interface ScanJobPayload {
  runId: string;
  jurisdiction: string;
  days: number;
  query?: string;
  max_results?: number;
}

export async function processScanJob(payload: ScanJobPayload): Promise<void> {
  const { runId, jurisdiction, days, query: searchQuery, max_results } = payload;
  await query("UPDATE runs SET status = 'running' WHERE id = $1", [runId]);

  try {
    await loadRuntimeConfig();
    await insertRunLog(runId, "detect", `开始采集 ${jurisdiction} 法规（最近 ${days} 天）`);
    const result = await runScan(
      jurisdiction,
      searchQuery || "ADAS,Battery,Emission,AI ACT,GDPR,Data Privacy,Cybersecurity,Automated Driving,WVTA,type approval,UNECE WP.29",
      days,
      max_results || 5,
      async (entry) => {
        await insertRunLog(runId, entry.stage, entry.message, entry.meta);
      }
    );

    await insertSourceDocuments(result.documents);

    let vectorCount = 0;
    try {
      vectorCount = await vectorizeDocuments(result.documents);
    } catch (err) {
      await query("UPDATE runs SET meta = COALESCE(meta, '{}'::jsonb) || $1 WHERE id = $2", [
        { vector_error: (err as Error).message },
        runId
      ]);
    }

    const accepted: RegulationItem[] = [];
    const reviewQueue: ReviewQueueItem[] = [];

    for (const item of result.items) {
      const validation = validateRegulationItem(item);
      const tier = (validation.data?.trust_tier || item.trust_tier) as string | undefined;
      const isHardLaw = tier === "TIER_A_BINDING";
      if (validation.ok && validation.data && isHardLaw) {
        await upsertRegulationItem(validation.data);
        accepted.push(validation.data);
      } else {
        const reasonParts = [];
        if (!validation.ok) reasonParts.push(validation.reason || "Schema validation failed");
        if (!isHardLaw) reasonParts.push(`Trust tier ${tier || "unknown"} requires review`);
        const queueItem: ReviewQueueItem = {
          id: uuidv4(),
          entity_type: "RegulationItem",
          payload: (validation.data || item) as unknown as Record<string, unknown>,
          reason: reasonParts.join(" | ") || "Unknown validation error",
          status: "pending",
          created_at: new Date().toISOString(),
          reviewed_at: null,
          reviewer: undefined
        };
        await insertReviewQueueItem(queueItem);
        reviewQueue.push(queueItem);
      }
    }

    const links = buildScanLinks(runId, result.documents, accepted, reviewQueue);
    await insertLinks(links);

    await insertRunLog(runId, "complete", `成功提取 ${result.items.length} 条法规条目`);
    await insertRunLog(runId, "complete", `采集完成 · 发现 ${result.discovered} / 提取成功 ${result.items.length} / 错误 ${result.errors.length}`);

    await query(
      "UPDATE runs SET status = 'completed', completed_at = NOW(), meta = $1 WHERE id = $2",
      [
        {
          discovered: result.discovered,
          errors: result.errors,
          vector_count: vectorCount,
          accepted: accepted.length,
          review: reviewQueue.length
        },
        runId
      ]
    );
  } catch (error) {
    await query(
      "UPDATE runs SET status = 'failed', completed_at = NOW(), meta = $1 WHERE id = $2",
      [
        { error: error instanceof Error ? error.message : String(error) },
        runId
      ]
    );
    throw error;
  }
}

function buildScanLinks(
  runId: string,
  documents: SourceDocument[],
  items: RegulationItem[],
  reviewQueue: ReviewQueueItem[]
) {
  const links: Array<{ fromType: string; fromId: string; toType: string; toId: string; relation: string; meta?: Record<string, unknown> }> = [];
  for (const doc of documents) {
    links.push({
      fromType: "Run",
      fromId: runId,
      toType: "SourceDocument",
      toId: doc.id,
      relation: "produced"
    });
  }

  for (const item of items) {
    links.push({
      fromType: "Run",
      fromId: runId,
      toType: "RegulationItem",
      toId: item.id,
      relation: "produced"
    });
    if (item.source_document_id) {
      links.push({
        fromType: "SourceDocument",
        fromId: item.source_document_id,
        toType: "RegulationItem",
        toId: item.id,
        relation: "extracted_from"
      });
    }
  }

  for (const queued of reviewQueue) {
    const payload = queued.payload as any;
    if (payload?.id) {
      links.push({
        fromType: "Run",
        fromId: runId,
        toType: "RegulationItem",
        toId: payload.id,
        relation: "queued_for_review",
        meta: { review_id: queued.id }
      });
      if (payload?.source_document_id) {
        links.push({
          fromType: "SourceDocument",
          fromId: payload.source_document_id,
          toType: "RegulationItem",
          toId: payload.id,
          relation: "extracted_from"
        });
      }
    }
  }

  return links;
}