import { query } from "./db";
import { rowToItem, rowToRun } from "./repository";
import { createHash } from "node:crypto";

type LineageNode = {
  id: string;
  label: string;
  type: string;
  meta?: Record<string, unknown>;
};

type LineageEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
};

const typePrefix: Record<string, string> = {
  Run: "run",
  SourceDocument: "doc",
  RegulationItem: "item",
  Requirement: "req",
  Evidence: "evidence"
};

export async function buildLineageGraph(): Promise<{ nodes: LineageNode[]; edges: LineageEdge[] }> {
  const nodes = new Map<string, LineageNode>();
  const edges = new Map<string, LineageEdge>();
  const nodeKeyToId = new Map<string, string>();
  const runIdToNodeId = new Map<string, string>();
  const sourceDocIdToNodeId = new Map<string, string>();
  const itemIdToNodeId = new Map<string, string>();
  const requirementIdToNodeId = new Map<string, string>();

  const { rows: runRows } = await query<any>("SELECT * FROM runs ORDER BY started_at DESC LIMIT 50");
  const runs = runRows.map(rowToRun);
  for (const run of runs) {
    const id = nodeId("run", run.id);
    nodes.set(id, {
      id,
      label: `${run.run_type.toUpperCase()} - ${new Date(run.started_at).toLocaleDateString("zh-CN")}`,
      type: "Run",
      meta: { status: run.status }
    });
    runIdToNodeId.set(run.id, id);
  }

  const { rows: docRows } = await query<any>(
    "SELECT * FROM source_documents ORDER BY retrieved_at DESC LIMIT 200"
  );
  for (const doc of docRows) {
    const key = doc.url
      ? normalizeUrl(doc.url)
      : `${doc.domain || ""}|${doc.title || ""}|${(doc.retrieved_at || "").slice(0, 10)}`;
    const id = upsertNode(
      nodes,
      nodeKeyToId,
      "SourceDocument",
      key,
      doc.title || doc.domain || "SourceDocument",
      { url: doc.url, domain: doc.domain }
    );
    sourceDocIdToNodeId.set(doc.id, id);
  }

  const { rows: itemRows } = await query<any>(
    "SELECT * FROM regulation_items ORDER BY created_at DESC LIMIT 200"
  );
  const items = itemRows.map(rowToItem);
  for (const item of items) {
    const key = item.url
      ? normalizeUrl(item.url)
      : `${item.title || item.summary_1line || ""}|${item.jurisdiction || ""}|${item.published_date || ""}`;
    const id = upsertNode(
      nodes,
      nodeKeyToId,
      "RegulationItem",
      key,
      item.title || item.summary_1line || "RegulationItem",
      {
        jurisdiction: item.jurisdiction,
        priority: item.priority,
        trust_tier: item.trust_tier,
        status: item.status
      }
    );
    itemIdToNodeId.set(item.id, id);
  }

  const { rows: reviewRows } = await query<any>(
    "SELECT * FROM review_queue ORDER BY created_at DESC LIMIT 200"
  );
  for (const row of reviewRows) {
    if (row.entity_type !== "RegulationItem") continue;
    const payload = row.payload || {};
    const payloadId = payload.id as string | undefined;
    if (!payloadId) continue;
    const key = payload.url
      ? normalizeUrl(payload.url)
      : `${payload.title || payload.summary_1line || ""}|${payload.jurisdiction || ""}|${payload.published_date || ""}`;
    const id = upsertNode(
      nodes,
      nodeKeyToId,
      "RegulationItem",
      key,
      payload.title || payload.summary_1line || "RegulationItem",
      {
        jurisdiction: payload.jurisdiction,
        priority: payload.priority,
        trust_tier: payload.trust_tier,
        status: payload.status,
        review_status: row.status
      }
    );
    itemIdToNodeId.set(payloadId, id);
  }

  const { rows: reqRows } = await query<any>(
    "SELECT * FROM requirements ORDER BY created_at DESC LIMIT 200"
  );
  for (const req of reqRows) {
    const key = req.requirement_family || req.id;
    const id = upsertNode(
      nodes,
      nodeKeyToId,
      "Requirement",
      key,
      req.requirement_family || "Requirement",
      { priority: req.priority }
    );
    requirementIdToNodeId.set(req.id, id);
  }

  const { rows: linkRows } = await query<any>("SELECT * FROM links");
  for (const link of linkRows) {
    const fromPrefix = typePrefix[link.from_type] || link.from_type.toLowerCase();
    const toPrefix = typePrefix[link.to_type] || link.to_type.toLowerCase();
    const source = resolveNodeId(
      link.from_type,
      link.from_id,
      runIdToNodeId,
      sourceDocIdToNodeId,
      itemIdToNodeId,
      requirementIdToNodeId,
      fromPrefix
    );
    const target = resolveNodeId(
      link.to_type,
      link.to_id,
      runIdToNodeId,
      sourceDocIdToNodeId,
      itemIdToNodeId,
      requirementIdToNodeId,
      toPrefix
    );
    if (!nodes.has(source)) {
      nodes.set(source, {
        id: source,
        label: link.from_type,
        type: link.from_type
      });
    }
    if (!nodes.has(target)) {
      nodes.set(target, {
        id: target,
        label: link.to_type,
        type: link.to_type
      });
    }
    const id = `${source}__${link.relation}__${target}`;
    edges.set(id, { id, source, target, relation: link.relation });
  }

  for (const item of items) {
    if (item.source_document_id) {
      const source = sourceDocIdToNodeId.get(item.source_document_id) || nodeId("doc", item.source_document_id);
      const target = itemIdToNodeId.get(item.id) || nodeId("item", item.id);
      const id = `${source}__extracted_from__${target}`;
      edges.set(id, { id, source, target, relation: "extracted_from" });
    }

    if (item.evidence?.citations?.length) {
      item.evidence.citations.forEach((citation, index) => {
        const evidenceKey = citation.url
          ? normalizeUrl(citation.url)
          : citation.title || `${item.id}-${index}`;
        const evidenceId = upsertNode(
          nodes,
          nodeKeyToId,
          "Evidence",
          evidenceKey,
          citation.title || citation.url || "Evidence",
          { url: citation.url }
        );
        const source = itemIdToNodeId.get(item.id) || nodeId("item", item.id);
        const target = evidenceId;
        const edgeId = `${source}__supported_by__${target}`;
        edges.set(edgeId, { id: edgeId, source, target, relation: "supported_by" });
      });
    }
  }

  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) };
}

function nodeId(prefix: string, id: string) {
  return `${prefix}:${id}`;
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${path}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

function hashKey(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function upsertNode(
  nodes: Map<string, LineageNode>,
  nodeKeyToId: Map<string, string>,
  type: string,
  canonicalKey: string,
  label: string,
  meta?: Record<string, unknown>
) {
  const key = `${type}|${canonicalKey}`;
  const existingId = nodeKeyToId.get(key);
  if (existingId) {
    const existing = nodes.get(existingId);
    if (existing) {
      existing.meta = mergeMeta(existing.meta, meta);
      if (shouldReplaceLabel(existing.label, label, type)) {
        existing.label = label;
      }
    }
    return existingId;
  }
  const prefix = typePrefix[type] || type.toLowerCase();
  const id = nodeId(prefix, hashKey(key));
  nodeKeyToId.set(key, id);
  nodes.set(id, { id, label, type, meta: meta || undefined });
  return id;
}

function mergeMeta(
  prev?: Record<string, unknown>,
  next?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(prev || {}) };
  for (const [key, value] of Object.entries(next || {})) {
    if (value === undefined || value === null || value === "") continue;
    merged[key] = value;
  }
  return Object.keys(merged).length ? merged : undefined;
}

function shouldReplaceLabel(existing: string, incoming: string, type: string) {
  if (!incoming) return false;
  const normalized = (existing || "").trim();
  return normalized === "" || normalized === type;
}

function resolveNodeId(
  type: string,
  id: string,
  runMap: Map<string, string>,
  docMap: Map<string, string>,
  itemMap: Map<string, string>,
  reqMap: Map<string, string>,
  prefix: string
) {
  if (type === "Run") {
    return runMap.get(id) || nodeId(prefix, id);
  }
  if (type === "SourceDocument") {
    return docMap.get(id) || nodeId(prefix, id);
  }
  if (type === "RegulationItem") {
    return itemMap.get(id) || nodeId(prefix, id);
  }
  if (type === "Requirement") {
    return reqMap.get(id) || nodeId(prefix, id);
  }
  return nodeId(prefix, id);
}
