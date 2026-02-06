import { v4 as uuidv4 } from "uuid";
import { runMerge } from "../services/merge";
import { validateRegulationItem, validateRequirement } from "../ontology/validator";
import type { RegulationItem, ReviewQueueItem, Requirement } from "@regpulse/ontology";
import { query } from "../db";
import { insertLinks, insertRequirement, insertReviewQueueItem, rowToItem, upsertRegulationItem } from "../repository";
import { loadRuntimeConfig } from "../config/runtime";

interface MergeJobPayload {
  runId: string;
  jurisdiction: string;
  enable_file_search?: boolean;
  vector_store_id?: string;
}

export async function processMergeJob(payload: MergeJobPayload): Promise<void> {
  const { runId, jurisdiction, enable_file_search, vector_store_id } = payload;
  await query("UPDATE runs SET status = 'running' WHERE id = $1", [runId]);

  try {
    await loadRuntimeConfig();
    const { rows } = await query<any>(
      "SELECT * FROM regulation_items WHERE jurisdiction = $1 ORDER BY created_at DESC",
      [jurisdiction]
    );
    const items = rows.map(rowToItem);

    const merge = await runMerge(items, jurisdiction, Boolean(enable_file_search), vector_store_id);

    const reviewQueue: ReviewQueueItem[] = [];
    const mergedItems: RegulationItem[] = [];
    const inferredTier = pickHighestTier(items);
    const inferredStage = pickHighestStage(items);

    for (const item of merge.mergedItems) {
      if (!item.trust_tier && inferredTier) {
        item.trust_tier = inferredTier;
      }
      if (!item.monitoring_stage && inferredStage) {
        item.monitoring_stage = inferredStage;
      }
      const validation = validateRegulationItem(item);
      const tier = (validation.data?.trust_tier || item.trust_tier) as string | undefined;
      const isHardLaw = tier === "TIER_A_BINDING";
      if (validation.ok && validation.data && isHardLaw) {
        await upsertRegulationItem(validation.data);
        mergedItems.push(validation.data);
      } else {
        const reasonParts = [];
        if (!validation.ok) reasonParts.push(validation.reason || "Invalid merge output");
        if (!isHardLaw) reasonParts.push(`Trust tier ${tier || "unknown"} requires review`);
        const queueItem: ReviewQueueItem = {
          id: uuidv4(),
          entity_type: "RegulationItem",
          payload: (validation.data || item) as unknown as Record<string, unknown>,
          reason: reasonParts.join(" | ") || "Invalid merge output",
          status: "pending",
          created_at: new Date().toISOString(),
          reviewed_at: null,
          reviewer: undefined
        };
        await insertReviewQueueItem(queueItem);
        reviewQueue.push(queueItem);
      }
    }

    const requirements: Requirement[] = [];
    const requirementIds: string[] = [];
    const allowRequirements = inferredTier === "TIER_A_BINDING";

    for (const reqItem of merge.radarTable) {
      const validation = validateRequirement(reqItem);
      if (!validation.ok || !validation.data) {
        continue;
      }
      if (allowRequirements) {
        const id = await insertRequirement(validation.data);
        requirements.push(validation.data);
        requirementIds.push(id);
      }
    }

    const links = buildMergeLinks(runId, mergedItems, requirementIds, items);
    await insertLinks(links);

    await query(
      "UPDATE runs SET status = 'completed', completed_at = NOW(), meta = $1 WHERE id = $2",
      [
        {
          merged: mergedItems.length,
          radar: requirements.length,
          data_gaps: merge.dataGaps,
          summary: merge.summary,
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

function buildMergeLinks(
  runId: string,
  items: RegulationItem[],
  requirementIds: string[],
  sourceItems: RegulationItem[]
) {
  const links: Array<{ fromType: string; fromId: string; toType: string; toId: string; relation: string; meta?: Record<string, unknown> }> = [];
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

  for (const reqId of requirementIds) {
    links.push({
      fromType: "Run",
      fromId: runId,
      toType: "Requirement",
      toId: reqId,
      relation: "produced"
    });
  }

  for (const reqId of requirementIds) {
    for (const src of sourceItems) {
      if (!src?.id) continue;
      links.push({
        fromType: "RegulationItem",
        fromId: src.id,
        toType: "Requirement",
        toId: reqId,
        relation: "mapped_to"
      });
    }
  }

  return links;
}

function pickHighestTier(items: RegulationItem[]): RegulationItem["trust_tier"] | undefined {
  const rank: Record<string, number> = {
    TIER_A_BINDING: 4,
    TIER_B_OFFICIAL_SIGNAL: 3,
    TIER_C_SOFT_REQ: 2,
    TIER_D_QUARANTINE: 1
  };
  let best: RegulationItem["trust_tier"] | undefined;
  let bestRank = 0;
  for (const item of items) {
    const tier = item.trust_tier;
    if (!tier) continue;
    const score = rank[tier] || 0;
    if (score > bestRank) {
      bestRank = score;
      best = tier;
    }
  }
  return best;
}

function pickHighestStage(items: RegulationItem[]): RegulationItem["monitoring_stage"] | undefined {
  const order = ["Drafting", "Official", "Comitology", "Interpreting", "Use&Registration"];
  let bestIndex = -1;
  let best: RegulationItem["monitoring_stage"] | undefined;
  for (const item of items) {
    const stage = item.monitoring_stage;
    if (!stage) continue;
    const index = order.indexOf(stage);
    if (index > bestIndex) {
      bestIndex = index;
      best = stage;
    }
  }
  return best;
}
