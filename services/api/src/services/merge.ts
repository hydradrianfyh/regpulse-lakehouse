import { createOpenAIClient, getModel } from "./openai";
import type { RegulationItem, Requirement, DataGap } from "@regpulse/ontology";
import { RequirementSchema, RegulationItemSchema, DataGapSchema } from "@regpulse/ontology";

export interface MergeResult {
  mergedItems: RegulationItem[];
  radarTable: Requirement[];
  dataGaps: DataGap[];
  summary: string;
}

export async function runMerge(
  items: RegulationItem[],
  jurisdiction: string,
  enableFileSearch: boolean,
  vectorStoreId?: string
): Promise<MergeResult> {
  const client = createOpenAIClient();
  const model = getModel();

  let fileSearchContext = "";
  if (enableFileSearch && vectorStoreId) {
    const response = await client.responses.create({
      model,
      input: `Find regulatory requirements related to ${jurisdiction} automotive regulations.`,
      tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }],
      include: ["file_search_call.results"]
    });

    for (const output of response.output) {
      if (output.type === "message") {
        for (const content of output.content) {
          if (content.type === "output_text") {
            fileSearchContext = content.text;
          }
        }
      }
    }
  }

  const docSummaries = items.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.source_type,
    jurisdiction: d.jurisdiction,
    source: d.source_org,
    url: d.url,
    content: d.summary_1line,
    metadata: { priority: d.priority, status: d.status }
  }));

  const systemPrompt = `You are a regulatory analyst. Merge documents into structured JSON.\n` +
    `Return: mergedItems, radarTable, dataGaps, summary.\n` +
    (fileSearchContext ? `Use file_search context:\n${fileSearchContext}\n` : "");

  const userPrompt = `Documents (${docSummaries.length}):\n${JSON.stringify(docSummaries, null, 2)}\n` +
    `Target jurisdiction: ${jurisdiction}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "merge_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            mergedItems: { type: "array", items: { type: "object" } },
            radarTable: { type: "array", items: { type: "object" } },
            dataGaps: { type: "array", items: { type: "object" } },
            summary: { type: "string" }
          },
          required: ["mergedItems", "radarTable", "dataGaps", "summary"],
          additionalProperties: false
        }
      }
    },
    max_completion_tokens: 2000
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty model response");
  }

  const parsed = JSON.parse(content);

  const mergedItems: RegulationItem[] = (parsed.mergedItems || []).map((item: unknown) => {
    const parsedItem = RegulationItemSchema.partial().safeParse(item);
    const safe = (parsedItem.success ? parsedItem.data : (item as any)) || {};
    return {
      ...safe,
      id: safe.id ?? "",
      jurisdiction: safe.jurisdiction ?? (jurisdiction as RegulationItem["jurisdiction"]),
      retrieved_at: safe.retrieved_at ?? new Date().toISOString(),
      evidence: safe.evidence ?? { raw_file_uri: null, text_snapshot_uri: null, citations: [] },
      confidence: safe.confidence ?? 0.7,
      notes: safe.notes ?? "",
      topics: safe.topics ?? [],
      impacted_areas: safe.impacted_areas ?? [],
      engineering_actions: safe.engineering_actions ?? [],
      source_document_id: safe.source_document_id
    } as RegulationItem;
  });

  const radarTable: Requirement[] = (parsed.radarTable || [])
    .map((entry: unknown) => {
      const parsedEntry = RequirementSchema.safeParse(entry);
      return parsedEntry.success ? parsedEntry.data : null;
    })
    .filter(Boolean) as Requirement[];

  const dataGaps: DataGap[] = (parsed.dataGaps || [])
    .map((entry: unknown) => {
      const parsedEntry = DataGapSchema.safeParse(entry);
      return parsedEntry.success ? parsedEntry.data : null;
    })
    .filter(Boolean) as DataGap[];

  return {
    mergedItems,
    radarTable,
    dataGaps,
    summary: parsed.summary
  };
}
