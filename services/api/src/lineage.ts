import { query } from "./db";
import { rowToItem, rowToRun } from "./repository";

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

  const { rows: runRows } = await query<any>("SELECT * FROM runs ORDER BY started_at DESC LIMIT 50");
  const runs = runRows.map(rowToRun);
  for (const run of runs) {
    const id = nodeId("run", run.id);
    nodes.set(id, {
      id,
      label: `${run.run_type.toUpperCase()} · ${new Date(run.started_at).toLocaleDateString("zh-CN")}`,
      type: "Run",
      meta: { status: run.status }
    });
  }

  const { rows: docRows } = await query<any>(
    "SELECT * FROM source_documents ORDER BY retrieved_at DESC LIMIT 200"
  );
  for (const doc of docRows) {
    const id = nodeId("doc", doc.id);
    nodes.set(id, {
      id,
      label: doc.title || doc.domain,
      type: "SourceDocument",
      meta: { url: doc.url, domain: doc.domain }
    });
  }

  const { rows: itemRows } = await query<any>(
    "SELECT * FROM regulation_items ORDER BY created_at DESC LIMIT 200"
  );
  const items = itemRows.map(rowToItem);
  for (const item of items) {
    const id = nodeId("item", item.id);
    nodes.set(id, {
      id,
      label: item.title,
      type: "RegulationItem",
      meta: { jurisdiction: item.jurisdiction, priority: item.priority }
    });
  }

  const { rows: reqRows } = await query<any>(
    "SELECT * FROM requirements ORDER BY created_at DESC LIMIT 200"
  );
  for (const req of reqRows) {
    const id = nodeId("req", req.id);
    nodes.set(id, {
      id,
      label: req.requirement_family || "Requirement",
      type: "Requirement",
      meta: { priority: req.priority }
    });
  }

  const { rows: linkRows } = await query<any>("SELECT * FROM links");
  for (const link of linkRows) {
    const fromPrefix = typePrefix[link.from_type] || link.from_type.toLowerCase();
    const toPrefix = typePrefix[link.to_type] || link.to_type.toLowerCase();
    const source = nodeId(fromPrefix, link.from_id);
    const target = nodeId(toPrefix, link.to_id);
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
      const source = nodeId("doc", item.source_document_id);
      const target = nodeId("item", item.id);
      const id = `${source}__extracted_from__${target}`;
      edges.set(id, { id, source, target, relation: "extracted_from" });
    }

    if (item.evidence?.citations?.length) {
      item.evidence.citations.forEach((citation, index) => {
        const evidenceId = nodeId("evidence", `${item.id}-${index}`);
        nodes.set(evidenceId, {
          id: evidenceId,
          label: citation.title || citation.url,
          type: "Evidence",
          meta: { url: citation.url }
        });
        const source = nodeId("item", item.id);
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
