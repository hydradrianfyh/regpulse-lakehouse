import { v4 as uuidv4 } from "uuid";
import * as cheerio from "cheerio";
import { createOpenAIClient, getModel } from "./openai";
import {
  ALLOWED_DOMAINS,
  ITEM_STATUSES,
  SOURCE_TYPES,
  TOPICS,
  IMPACTED_AREAS,
  PRIORITIES,
  type RegulationItem,
  type SourceDocument
} from "@regpulse/ontology";
import { fetchEUNewsList } from "../connectors/eu_news";
import { fetchGlobalAutoRegs } from "../connectors/globalautoregs";
import { fetchHtml } from "../connectors/fetcher";
import { evaluateSource, getProfiles, loadPolicy, canonicalizeUrl } from "../ontology/policy";
import type { TrustTier, PolicyProfile } from "../ontology/policy";

export interface ScanResult {
  discovered: number;
  items: RegulationItem[];
  documents: SourceDocument[];
  errors: string[];
}

interface SourceCandidate {
  url: string;
  title: string;
  content: string;
  published_date?: string;
  raw_file_uri?: string;
  profile_id?: string;
  files?: Array<{ url: string; label?: string; ext?: string; source?: string }>;
  stored_files?: Array<{
    url: string;
    label?: string;
    ext?: string;
    source?: string;
    stored_id?: string;
    sha256?: string;
    size?: number;
    cached?: boolean;
    download_url?: string;
    error?: string;
  }>;
  reference_number?: string;
  submitted_by?: string;
  meeting_sessions?: string;
  document_date?: string;
  relevant_to?: string[];
  document_type?: string;
}

export interface ScanProgressEntry {
  stage: string;
  message: string;
  meta?: Record<string, unknown>;
}

const DEFAULT_QUERY = "ADAS,Battery,Emission,AI ACT,GDPR,Data Privacy,Cybersecurity,Automated Driving,WVTA,type approval,UNECE WP.29";
const MONITORING_KEYWORDS = [
  "Lighting and Light-Signalling",
  "Passive Safety",
  "Driving Automation",
  "Emissions and Energy",
  "Vehicle and Tyre Noise",
  "Braking and Steering",
  "Tyres",
  "General Construction Safety",
  "World Forum (WP.29)",
  "Working Party on Automated and Connected Vehicles (GRVA)",
  "Working Party on General Safety (GRSG)",
  "Working Party on Lighting and Light-signalling (GRE)",
  "Working Party on Noise and Tyres (GRBP)",
  "Working Party on Passive Safety (GRSP)",
  "Working Party on Pollution and Energy (GRPE)",
  "WP.29 Informal Working Groups"
];
const MAX_WEB_SEARCH_QUERIES = 15;
const MAX_GAR_TITLE_QUERIES = 10;

export async function runScan(
  jurisdiction: string,
  query: string | undefined,
  days: number,
  maxResults?: number,
  onProgress?: (entry: ScanProgressEntry) => Promise<void> | void
): Promise<ScanResult> {
  const errors: string[] = [];
  const policy = await loadPolicy();
  const profiles = getProfiles(policy);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const baseQuery = query?.trim() || DEFAULT_QUERY;
  const useMonitoringSearch = !query || query.trim().length === 0;
  const generalLimit = typeof maxResults === "number" ? maxResults : 200;
  const discoveryLimit = Math.max(generalLimit * 3, 200);
  const garLimit = 200;

  const candidates: SourceCandidate[] = [];
  const log = async (stage: string, message: string, meta?: Record<string, unknown>) => {
    if (!onProgress) return;
    try {
      await onProgress({ stage, message, meta });
    } catch {
      // Ignore logging failures to avoid interrupting scan flow.
    }
  };

  await log("search", "正在从连接器获取候选法规...");
  for (const profile of profiles) {
    const listUrl = buildListUrl(profile.domain, profile.path, profile.required_query_params);
    try {
      if (profile.connector === "eu_news") {
        await log("search", `连接器 EU 新闻: ${profile.domain}${profile.path}`);
        const docs = await fetchEUNewsList(listUrl, discoveryLimit);
        await log("search", `EU 新闻候选 ${docs.length} 条`);
        docs.forEach((doc) => candidates.push({
          url: doc.url,
          title: doc.title,
          content: doc.content,
          published_date: doc.published_date,
          profile_id: profile.id
        }));
      }
      if (profile.connector === "globalautoregs") {
        await log("search", `连接器 GlobalAutoRegs: ${profile.domain}${profile.path}`);
        const docs = await fetchGlobalAutoRegs(listUrl, garLimit, (stage, message, meta) => {
          log(stage, message, meta);
        });
        await log("search", `GlobalAutoRegs 候选 ${docs.length} 条`);
        docs.forEach((doc) => candidates.push({
          url: doc.url,
          title: doc.title,
          content: doc.content,
          published_date: doc.published_date,
          raw_file_uri: doc.raw_file_uri,
          profile_id: profile.id,
          files: doc.files,
          stored_files: doc.stored_files,
          reference_number: doc.reference_number,
          submitted_by: doc.submitted_by,
          meeting_sessions: doc.meeting_sessions,
          document_date: doc.document_date,
          relevant_to: doc.relevant_to,
          document_type: doc.document_type
        }));
      }
      if (profile.connector === "generic_list") {
        await log("search", `连接器 Generic: ${profile.domain}${profile.path}`);
        const docs = await fetchGenericList(listUrl, profile.allowed_paths, discoveryLimit);
        await log("search", `Generic 候选 ${docs.length} 条`);
        docs.forEach((doc) => candidates.push({
          url: doc.url,
          title: doc.title,
          content: doc.content,
          published_date: doc.published_date,
          profile_id: profile.id
        }));
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      await log("error", `连接器失败: ${(err as Error).message} || ${String(err)}`);
      continue;
    }
  }

  try {
    await log("search", "正在使用 web_search 搜索允许域名中的法规...");
    const queries = buildWebSearchQueries(baseQuery, days, candidates, useMonitoringSearch);
    const perQuery = Math.min(
      8,
      Math.max(3, Math.floor(discoveryLimit / Math.max(1, queries.length)))
    );
    const webCandidates = await fetchWebSearchCandidatesForQueries(
      queries,
      perQuery,
      discoveryLimit,
      days,
      async (q) => {
        await log("search", `web_search 查询: ${q}`);
      }
    );
    await log("search", `web_search 找到 ${webCandidates.length} 条候选`);
    candidates.push(...webCandidates);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    await log("error", `web_search 失败: ${(err as Error).message} || ${String(err)}`);
  }

  const filtered = filterByDays(dedupeByUrl(candidates), days);
  await log("search", `去重后共 ${filtered.length} 条候选`);
  const sorted = sortCandidates(filtered, policy, profileById);
  const selected = sorted.slice(0, generalLimit);
  await log("triage", "正在分诊和结构化...");

  const documents: SourceDocument[] = [];
  const items: RegulationItem[] = [];

  for (let i = 0; i < selected.length; i += 1) {
    const result = selected[i];
    await log("process", `正在处理: ${result.title}`);
    const docId = uuidv4();
    const canonicalUrl = canonicalizeUrl(result.url, policy);
    const profile = result.profile_id ? profileById.get(result.profile_id) : undefined;
    const evaluated = profile
      ? {
        tier: profile.tier,
        stage: profile.stage,
        profile_id: profile.id,
        requires_review: Boolean(profile.requires_review),
        route: profile.tier === "TIER_A_BINDING" && !profile.requires_review ? "main" : "review_queue",
        canonical_url: canonicalUrl
      }
      : await evaluateSource(result.url);
    const domain = safeDomain(canonicalUrl);

    documents.push({
      id: docId,
      url: canonicalUrl,
      domain,
      title: result.title,
      content: result.content,
      retrieved_at: new Date().toISOString(),
      hash: hashString(`${canonicalUrl}|${result.title}`),
      meta: {
        published_date: result.published_date ?? null,
        trust_tier: evaluated.tier,
        monitoring_stage: evaluated.stage,
        source_profile_id: evaluated.profile_id || result.profile_id || null,
        raw_file_uri: result.raw_file_uri || null,
        raw_files: result.files || null,
        stored_files: result.stored_files || null,
        content_fetch_id: result.stored_files?.[0]?.stored_id || null,
        reference_number: result.reference_number || null,
        submitted_by: result.submitted_by || null,
        meeting_sessions: result.meeting_sessions || null,
        document_date: result.document_date || null,
        relevant_to: result.relevant_to || null,
        document_type: result.document_type || null
      }
    });

    try {
      const extracted = await extractRegulationItem(result, jurisdiction, docId, evaluated.tier, evaluated.stage, evaluated.profile_id);
      items.push(extracted);
      await log("extract", `已提取: ${result.title} [${extracted.priority}]`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      await log("error", `提取失败: ${result.title}`);
    }
  }

  return {
    discovered: filtered.length,
    items,
    documents,
    errors
  };
}

async function extractRegulationItem(
  result: SourceCandidate,
  jurisdiction: string,
  sourceDocumentId: string,
  trustTier: string,
  monitoringStage: string,
  sourceProfileId?: string
): Promise<RegulationItem> {
  const client = createOpenAIClient();
  const model = getModel();

  const systemPrompt = `You are a regulatory analyst. Extract structured JSON.
` +
    `Use strict schema with fields: source_type, summary_1line, published_date, effective_date, status, topics, impacted_areas, priority, engineering_actions, confidence, notes.`;

  const userPrompt = `Title: ${result.title}
URL: ${result.url}
Content: ${result.content}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "regulation_item",
        strict: true,
        schema: {
          type: "object",
          properties: {
            source_type: { type: "string", enum: SOURCE_TYPES },
            summary_1line: { type: "string" },
            published_date: { type: ["string", "null"] },
            effective_date: { type: ["string", "null"] },
            status: { type: "string", enum: ITEM_STATUSES },
            topics: { type: "array", items: { type: "string", enum: TOPICS } },
            impacted_areas: { type: "array", items: { type: "string", enum: IMPACTED_AREAS } },
            priority: { type: "string", enum: PRIORITIES },
            engineering_actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  owner_role: { type: "string" },
                  due_date: { type: ["string", "null"] },
                  artifact: { type: "string" }
                },
                required: ["action", "owner_role", "due_date", "artifact"],
                additionalProperties: false
              }
            },
            confidence: { type: "number" },
            notes: { type: "string" }
          },
          required: [
            "source_type",
            "summary_1line",
            "published_date",
            "effective_date",
            "status",
            "topics",
            "impacted_areas",
            "priority",
            "engineering_actions",
            "confidence",
            "notes"
          ],
          additionalProperties: false
        }
      }
    },
    max_completion_tokens: 1200
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty model response");
  }

  const parsed = JSON.parse(content);
  const id = uuidv4();

  const normalizedSourceType = SOURCE_TYPES.includes(parsed.source_type) ? parsed.source_type : "guidance";
  const normalizedStatus = ITEM_STATUSES.includes(parsed.status) ? parsed.status : "unknown";
  const normalizedPriority = normalizePriority(parsed.priority);
  const normalizedTopics = Array.isArray(parsed.topics)
    ? parsed.topics.filter((topic: string) => TOPICS.includes(topic as any))
    : [];
  const normalizedImpactedAreas = Array.isArray(parsed.impacted_areas)
    ? parsed.impacted_areas.filter((area: string) => IMPACTED_AREAS.includes(area as any))
    : [];
  const normalizedConfidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.7;
  const normalizedSummary = String(parsed.summary_1line || "").trim() || result.title;
  const storedFileLink = Array.isArray(result.stored_files)
    ? result.stored_files.find((f) => f?.download_url)
    : undefined;

  return {
    id,
    jurisdiction: jurisdiction as RegulationItem["jurisdiction"],
    source_org: determineSourceOrg(result.url),
    source_type: normalizedSourceType,
    title: result.title,
    summary_1line: normalizedSummary.slice(0, 400),
    url: result.url,
    published_date: parsed.published_date ?? result.published_date ?? null,
    retrieved_at: new Date().toISOString(),
    effective_date: parsed.effective_date ?? null,
    status: normalizedStatus,
    topics: normalizedTopics,
    impacted_areas: normalizedImpactedAreas,
    engineering_actions: parsed.engineering_actions || [],
    evidence: {
      raw_file_uri: storedFileLink?.download_url || result.raw_file_uri || null,
      text_snapshot_uri: null,
      citations: [{ title: result.title, url: result.url, snippet: result.content.slice(0, 300) }]
    },
    confidence: normalizedConfidence,
    notes: parsed.notes ?? "",
    priority: normalizedPriority,
    source_document_id: sourceDocumentId,
    trust_tier: trustTier as RegulationItem["trust_tier"],
    monitoring_stage: monitoringStage as RegulationItem["monitoring_stage"],
    source_profile_id: sourceProfileId
  } as RegulationItem;
}

function buildListUrl(domain: string, path: string, params?: Record<string, string[]>) {
  const url = new URL(`https://${domain}${path}`);
  if (params) {
    for (const [key, values] of Object.entries(params)) {
      if (values.length > 0) {
        url.searchParams.set(key, values[0]);
      }
    }
  }
  return url.toString();
}

function dedupeByUrl(items: SourceCandidate[]) {
  const seen = new Set<string>();
  const result: SourceCandidate[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    result.push(item);
  }
  return result;
}

async function fetchWebSearchCandidates(query: string, maxResults: number, days?: number): Promise<SourceCandidate[]> {
  if (!query) return [];
  const client = createOpenAIClient();
  const model = getModel();
  const timeHint = typeof days === "number" && days > 0 ? ` within the last ${days} days` : "";

  const response = await client.responses.create({
    model,
    input: `Search for recent regulatory updates${timeHint} related to: ${query}.`,
    tools: [{
      type: "web_search",
      filters: { allowed_domains: [...ALLOWED_DOMAINS] }
      }],
      include: ["web_search_call.action.sources"]
    });

  const sources = extractWebSources(response);
  const results: SourceCandidate[] = [];
  for (const source of sources.slice(0, maxResults)) {
    if (!source.url || !isAllowedDomain(source.url)) continue;
    try {
      const doc = await fetchGenericDocument(source.url);
      if (doc) results.push(doc);
    } catch {
      continue;
    }
  }
  return results;
}

async function fetchWebSearchCandidatesForQueries(
  queries: string[],
  maxPerQuery: number,
  maxTotal: number,
  days: number,
  onQuery?: (query: string) => Promise<void> | void
) {
  const results: SourceCandidate[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const normalized = normalizeQuery(query);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (onQuery) await onQuery(query);
    const batch = await fetchWebSearchCandidates(query, maxPerQuery, days);
    results.push(...batch);
    if (results.length >= maxTotal) break;
  }
  return results.slice(0, maxTotal);
}

function buildWebSearchQueries(
  baseQuery: string,
  days: number,
  candidates: SourceCandidate[],
  includeMonitoring: boolean
) {
  const queries: string[] = [];
  if (baseQuery?.trim()) {
    queries.push(baseQuery.trim());
  }

  if (includeMonitoring) {
    const grouped = groupKeywords(MONITORING_KEYWORDS, 4);
    grouped.forEach((group) => {
      queries.push(group.join(", "));
    });

    const garTitleQueries = extractGarTitleQueries(candidates, days, MAX_GAR_TITLE_QUERIES);
    queries.push(...garTitleQueries);
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    const normalized = normalizeQuery(q);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(q);
    if (unique.length >= MAX_WEB_SEARCH_QUERIES) break;
  }
  return unique;
}

function extractGarTitleQueries(
  candidates: SourceCandidate[],
  days: number,
  limit: number
) {
  const garDocs = candidates
    .filter((c) => c.url.includes("globalautoregs.com") && c.url.includes("/documents/") && c.title)
    .map((c) => ({ ...c, dateScore: parseCandidateDate(c) }));
  garDocs.sort((a, b) => b.dateScore - a.dateScore);
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const doc of garDocs) {
    const title = doc.title?.trim();
    if (!title) continue;
    const normalized = normalizeQuery(title);
    if (seen.has(normalized)) continue;
    if (days) {
      const ts = doc.dateScore;
      if (ts && ts < Date.now() - days * 24 * 60 * 60 * 1000) continue;
    }
    seen.add(normalized);
    titles.push(title);
    if (titles.length >= limit) break;
  }
  return titles;
}

function normalizeQuery(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function groupKeywords(keywords: string[], size: number) {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const keyword of keywords) {
    if (!keyword) continue;
    current.push(keyword);
    if (current.length >= size) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function extractWebSources(response: any): Array<{ url?: string; title?: string }> {
  const sources: Array<{ url?: string; title?: string }> = [];
  if (Array.isArray(response?.sources)) {
    for (const source of response.sources) {
      if (source?.url) sources.push({ url: source.url, title: source.title });
    }
  }
  if (Array.isArray(response?.output)) {
    for (const output of response.output) {
      if (output?.type === "web_search_call" && output?.action?.sources) {
        for (const source of output.action.sources) {
          if (source?.url) sources.push({ url: source.url, title: source.title });
        }
      }
    }
  }
  return sources;
}

async function fetchGenericDocument(url: string): Promise<SourceCandidate | null> {
  const headers = buildGenericHeaders(url);
  const { html } = await fetchHtml(url, { headers, timeoutMs: 45000, retries: 2 });
  const $ = cheerio.load(html);
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("meta[name='title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();
  if (!title) return null;

  const description =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    $("p").first().text().trim();

  const published =
    $("time").attr("datetime") ||
    $("meta[property='article:published_time']").attr("content") ||
    undefined;

  const content = extractGenericText($, description);

  return {
    url,
    title,
    content: content.slice(0, 4000),
    published_date: published ? published.slice(0, 10) : undefined
  };
}

async function fetchGenericList(listUrl: string, allowedPaths: string[] | undefined, maxItems: number): Promise<SourceCandidate[]> {
  const headers = buildGenericHeaders(listUrl);
  const html = await fetchHtmlWithFallbacks(listUrl, headers);
  const $ = cheerio.load(html);
  const base = new URL(listUrl);
  const links = new Set<string>();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#") || href.startsWith("mailto:")) return;
    const normalized = href.startsWith("/")
      ? `${base.origin}${href}`
      : href;
    try {
      const url = new URL(normalized);
      if (url.hostname.replace("www.", "") !== base.hostname.replace("www.", "")) return;
      if (allowedPaths && allowedPaths.length > 0) {
        const ok = allowedPaths.some((p) => url.pathname.startsWith(p));
        if (!ok) return;
      }
      links.add(url.toString());
    } catch {
      return;
    }
  });

  const results: SourceCandidate[] = [];
  for (const link of Array.from(links).slice(0, maxItems)) {
    const doc = await fetchGenericDocument(link);
    if (doc) results.push(doc);
  }
  return results;
}

function extractGenericText($: cheerio.CheerioAPI, fallback?: string) {
  const blocks = [
    $("article p"),
    $("main p"),
    $("section p"),
    $("p")
  ];
  for (const block of blocks) {
    const paragraphs = block
      .toArray()
      .map((p) => $(p).text().trim())
      .filter(Boolean);
    if (paragraphs.length > 0) {
      return paragraphs.join("\n");
    }
  }
  return fallback || "";
}

function sortCandidates(
  items: SourceCandidate[],
  policy: Awaited<ReturnType<typeof loadPolicy>>,
  profileById: Map<string, PolicyProfile>
) {
  const enriched = items.map((item, index) => {
    const profile = item.profile_id ? profileById.get(item.profile_id) : undefined;
    const isGar = profile?.connector === "globalautoregs" || item.url.includes("globalautoregs.com");
    const tier = resolveTier(item, policy, profile);
    const bucket = isGar ? 0 : tier === "TIER_A_BINDING" ? 1 : 2;
    const dateScore = parseCandidateDate(item);
    return { item, bucket, dateScore, index };
  });

  enriched.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (a.dateScore !== b.dateScore) return b.dateScore - a.dateScore;
    return a.index - b.index;
  });

  return enriched.map((entry) => entry.item);
}

function resolveTier(
  item: SourceCandidate,
  policy: Awaited<ReturnType<typeof loadPolicy>>,
  profile?: PolicyProfile
): TrustTier | null {
  if (profile?.tier) return profile.tier;
  const domain = safeDomain(item.url);
  for (const [tier, cfg] of Object.entries(policy.tiers)) {
    if (cfg.domains && cfg.domains.some((d) => domain.includes(d))) {
      return tier as TrustTier;
    }
  }
  return null;
}

function parseCandidateDate(item: SourceCandidate) {
  const value = item.published_date || item.document_date;
  if (!value) return 0;
  const ts = Date.parse(value);
  if (!Number.isNaN(ts)) return ts;
  const match = value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const fallback = Date.UTC(year, month, day);
    return Number.isNaN(fallback) ? 0 : fallback;
  }
  return 0;
}

function buildGenericHeaders(url: string) {
  const origin = new URL(url).origin;
  const headers: Record<string, string> = { Referer: origin };
  const host = safeDomain(url);
  const uneceUa = process.env.UNECE_USER_AGENT || process.env.GAR_USER_AGENT;
  if (host.includes("unece.org") && uneceUa) {
    headers["User-Agent"] = uneceUa;
  }
  return headers;
}

async function fetchHtmlWithFallbacks(url: string, headers: Record<string, string>) {
  let lastError: unknown;
  try {
    const { html } = await fetchHtml(url, { headers, timeoutMs: 45000, retries: 2 });
    return html;
  } catch (err) {
    lastError = err;
    if (!safeDomain(url).includes("unece.org")) throw err;
  }

  const fallbacks = buildUneceFallbackUrls(url);
  for (const fallback of fallbacks) {
    try {
      const fallbackHeaders = { ...headers, Referer: new URL(fallback).origin };
      const { html } = await fetchHtml(fallback, { headers: fallbackHeaders, timeoutMs: 45000, retries: 2 });
      return html;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`UNECE fallback failed for ${url} :: ${reason}`);
}

function buildUneceFallbackUrls(url: string) {
  const parsed = new URL(url);
  const paths = new Set<string>();
  paths.add(parsed.pathname);
  if (parsed.pathname.endsWith("/transport/vehicle-regulations")) {
    paths.add("/transport/vehicle-regulations/wp29-new-regulations");
    paths.add("/transport/vehicle-regulations/wp29-vehicle-regulations");
    paths.add("/transport/vehicle-regulations/wp29");
  }
  const origins = [
    parsed.origin,
    parsed.origin.replace("://", "://www."),
    "https://www.unece.org"
  ];
  const urls: string[] = [];
  for (const origin of origins) {
    for (const path of paths) {
      urls.push(`${origin}${path}`);
    }
  }
  return Array.from(new Set(urls));
}

function filterByDays(items: SourceCandidate[], days: number) {
  if (!days) return items;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const dateValue = item.published_date || item.document_date;
    if (!dateValue) return true;
    const ts = Date.parse(dateValue);
    if (Number.isNaN(ts)) return true;
    return ts >= cutoff;
  });
}

function isAllowedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return ALLOWED_DOMAINS.some((domain) => host.includes(domain));
  } catch {
    return false;
  }
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}

function determineSourceOrg(url: string): string {
  const host = safeDomain(url).toLowerCase();
  if (host.includes("unece.org")) return "UNECE";
  if (host.includes("eur-lex.europa.eu")) return "EUR-Lex";
  if (host.includes("op.europa.eu")) return "Publications Office";
  if (host.includes("publications.europa.eu")) return "Publications Office";
  if (host.includes("globalautoregs.com")) return "GlobalAutoRegs";
  if (host.includes("commission.europa.eu")) return "European Commission";
  if (host.includes("ec.europa.eu")) return "European Commission";
  if (host.includes("digital-strategy.ec.europa.eu")) return "EU Digital Strategy";
  if (host.includes("futurium.ec.europa.eu")) return "EU AI Alliance";
  if (host.includes("rdw.nl")) return "RDW";
  if (host.includes("vca.gov.uk")) return "VCA";
  if (host.includes("edpb.europa.eu")) return "EDPB";
  if (host.includes("edps.europa.eu")) return "EDPS";
  if (host.includes("ico.org.uk")) return "ICO";
  if (host.includes("bfdi.bund.de")) return "BfDI";
  if (host.includes("bsi.bund.de")) return "BSI";
  if (host.includes("cnil.fr")) return "CNIL";
  if (host.includes("enisa.europa.eu")) return "ENISA";
  if (host.includes("wiki.unece.org")) return "UNECE Wiki";
  if (host.includes("www.gov.uk")) return "UK Government";
  if (host.includes("kba.de")) return "KBA";
  if (host.includes("utac.com")) return "UTAC";
  if (host.includes("idiada.com")) return "IDIADA";
  if (host.includes("vda.de")) return "VDA";
  if (host.includes("euroncap.com")) return "Euro NCAP";
  if (host.includes("iso.org")) return "ISO";
  if (host.includes("din.de")) return "DIN";
  if (host.includes("enx.com")) return "ENX";
  if (host.includes("iapp.org")) return "IAPP";
  if (host.includes("euractiv.com")) return "Euractiv";
  if (host.includes("globalprivacyblog.com")) return "Global Privacy Blog";
  if (host.includes("blogs.dlapiper.com")) return "DLA Piper Blog";
  return "Unknown";
}

function normalizePriority(value: unknown): RegulationItem["priority"] {
  if (typeof value === "string" && PRIORITIES.includes(value as any)) {
    return value as RegulationItem["priority"];
  }
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized.includes("p0") || normalized.includes("urgent") || normalized.includes("critical")) return "P0";
  if (normalized.includes("p1") || normalized.includes("high")) return "P1";
  if (normalized.includes("p2") || normalized.includes("medium") || normalized.includes("low")) return "P2";
  return "P2";
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
