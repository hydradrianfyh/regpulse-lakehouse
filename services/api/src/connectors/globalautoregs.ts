import * as cheerio from "cheerio";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { promises as fs } from "node:fs";
import { fetchBuffer, fetchHtml } from "./fetcher";
import { getStoredFilePath, storeRemoteFile } from "../storage/object-store";
import { getGarRecord, setGarRecord } from "../storage/gar-index";

export interface GarFileLink {
  url: string;
  label?: string;
  ext?: string;
  source?: string;
}

export interface GarStoredFile extends GarFileLink {
  stored_id?: string;
  sha256?: string;
  size?: number;
  cached?: boolean;
  download_url?: string;
  error?: string;
}

export interface GarDocument {
  url: string;
  title: string;
  content: string;
  published_date?: string;
  raw_file_uri?: string;
  files?: GarFileLink[];
  stored_files?: GarStoredFile[];
  reference_number?: string;
  submitted_by?: string;
  meeting_sessions?: string;
  document_date?: string;
  relevant_to?: string[];
  document_type?: string;
}

export type GarProgressFn = (stage: "download" | "ingest" | "info", message: string, meta?: Record<string, unknown>) => void;

export async function fetchGlobalAutoRegs(listUrl: string, maxItems = 10, onProgress?: GarProgressFn): Promise<GarDocument[]> {
  const detailLinks = await fetchDetailLinks(listUrl, maxItems);
  const results: GarDocument[] = [];
  for (const link of detailLinks) {
    try {
      const doc = await fetchDocument(link, onProgress);
      if (doc) results.push(doc);
    } catch {
      continue;
    }
  }
  const sorted = results.sort((a, b) => {
    const tsA = parseDate(a.published_date || a.document_date);
    const tsB = parseDate(b.published_date || b.document_date);
    return tsB - tsA;
  });
  return sorted.slice(0, maxItems);
}

async function fetchDocument(url: string, onProgress?: GarProgressFn): Promise<GarDocument | null> {
  const headers = buildGarHeaders(url);
  const { html } = await fetchHtml(url, { timeoutMs: 45000, retries: 3, headers });
  const $ = cheerio.load(html);
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();
  if (!title) return null;

  const published =
    $("time").attr("datetime") ||
    $("meta[property='article:published_time']").attr("content") ||
    undefined;

  const fileLinks = findFileLinks($, url);
  const storedFiles: GarStoredFile[] = [];
  let content = "";
  let rawFileUri: string | undefined;

  if (fileLinks.length > 0) {
    const primary = pickPrimaryFile(fileLinks);
    const hasGar = fileLinks.some((f) => f.source === "GAR");
    const hasUnece = fileLinks.some((f) => f.source === "UNECE");
    if (hasGar && hasUnece) {
      await emitProgress(
        onProgress,
        "info",
        `Skip UNECE download (GAR available): ${title}`,
        { detail_url: url }
      );
    }
    const ordered = buildDownloadTargets(fileLinks, primary);
    if (hasGar) {
      rawFileUri = fileLinks.find((f) => f.source === "GAR")?.url;
    } else if (primary) {
      rawFileUri = primary.url;
    } else {
      rawFileUri = fileLinks[0]?.url;
    }

    for (const file of ordered) {
      const stored = await downloadStoreAndExtract(file, { title, detailUrl: url }, onProgress);
      storedFiles.push(stored);
      if (!content && stored.extracted_text) {
        content = stored.extracted_text;
      }
    }
  }

  if (!content) {
    const paragraphs = $("p")
      .toArray()
      .map((p) => $(p).text().trim())
      .filter(Boolean);
    content = paragraphs.slice(0, 10).join("\n");
  }

  const meta = extractMetadata($, title);

  return {
    url,
    title,
    content: content.slice(0, 4000),
    published_date: published ? published.slice(0, 10) : undefined,
    raw_file_uri: rawFileUri,
    files: fileLinks,
    stored_files: storedFiles.length ? storedFiles : undefined,
    reference_number: meta.reference_number,
    submitted_by: meta.submitted_by,
    meeting_sessions: meta.meeting_sessions,
    document_date: meta.document_date,
    relevant_to: meta.relevant_to,
    document_type: meta.document_type
  };
}

async function fetchDetailLinks(listUrl: string, maxItems: number) {
  const headers = buildGarHeaders(listUrl);
  const { html } = await fetchHtml(listUrl, { timeoutMs: 45000, retries: 3, headers });
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
      if (url.pathname.startsWith("/documents/") || url.pathname.startsWith("/modifications/")) {
        links.add(url.toString());
      }
    } catch {
      return;
    }
  });
  return Array.from(links).slice(0, maxItems);
}

function findFileLinks($: cheerio.CheerioAPI, baseUrl: string): GarFileLink[] {
  const links: GarFileLink[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const text = $(el).text().trim();
    const normalized = href.startsWith("/")
      ? `${new URL(baseUrl).origin}${href}`
      : href;
    const extMatch = normalized.match(/\.(docx|pdf|pptx|xls|xlsx)(\?|#|$)/i);
    const textExtMatch = text.match(/\.(docx|pdf|pptx|xls|xlsx)\b/i);
    if (!extMatch && !textExtMatch) return;

    const ext = (extMatch?.[1] || textExtMatch?.[1] || "").toLowerCase();
    const parentText = $(el).closest("section,div,td,li").text().toLowerCase();
    const hrefHost = (() => {
      try {
        return new URL(normalized).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    const source = hrefHost.includes("globalautoregs.com")
      ? "GAR"
      : parentText.includes("download from unece") || parentText.includes("unece") || text.toLowerCase().includes("unece")
        ? "UNECE"
        : undefined;

    links.push({
      url: normalized,
      label: text || undefined,
      ext: ext || undefined,
      source
    });
  });

  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

async function downloadStoreAndExtract(
  file: GarFileLink,
  context: { title: string; detailUrl: string },
  onProgress?: GarProgressFn
): Promise<GarStoredFile & { extracted_text?: string }> {
  const cooldownMinutes = Number(process.env.GAR_RETRY_COOLDOWN_MINUTES || 180);
  const shouldSkip = await shouldSkipFailed(file.url, cooldownMinutes);
  if (shouldSkip) {
    await emitProgress(onProgress, "info", `失败冷却中，跳过下载: ${context.title}`, { url: file.url });
    return { ...file, error: "cooldown_skip" };
  }

  const cached = await loadCachedFile(file);
  if (cached) {
    await emitProgress(onProgress, "download", `命中缓存: ${context.title}`, { url: file.url, detail_url: context.detailUrl });
    return cached;
  }
  try {
    await emitProgress(onProgress, "download", `正在下载原件: ${context.title}`, { url: file.url, detail_url: context.detailUrl });
    const headers = buildGarHeaders(context.detailUrl, file.url);
    const { buffer } = await fetchBuffer(file.url, { timeoutMs: 60000, retries: 3, headers });
    const stored = await storeRemoteFile(file.url, buffer, file.ext);
    const text = await extractText(buffer, file.ext);
    await setGarRecord(file.url, {
      stored_id: stored.id,
      sha256: stored.sha256,
      size: stored.size,
      ext: stored.ext,
      download_url: `/api/files/${stored.id}`,
      status: "cached",
      last_seen: new Date().toISOString(),
      last_attempt: new Date().toISOString()
    });
    await emitProgress(onProgress, "ingest", `原件已入库: ${context.title}`, { sha256: stored.sha256, size: stored.size });
    return {
      ...file,
      stored_id: stored.id,
      sha256: stored.sha256,
      size: stored.size,
      cached: stored.cached,
      download_url: `/api/files/${stored.id}`,
      extracted_text: text
    };
  } catch (err) {
    await setGarRecord(file.url, {
      status: "failed",
      last_attempt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      ext: file.ext
    });
    return {
      ...file,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function loadCachedFile(file: GarFileLink): Promise<GarStoredFile & { extracted_text?: string } | null> {
  const record = await getGarRecord(file.url);
  if (!record?.stored_id) return null;
  try {
    const filePath = await getStoredFilePath(record.stored_id);
    await fs.access(filePath);
    await setGarRecord(file.url, {
      ...record,
      status: "cached",
      last_seen: new Date().toISOString()
    });
    return {
      ...file,
      stored_id: record.stored_id,
      sha256: record.sha256,
      size: record.size,
      cached: true,
      download_url: record.download_url || `/api/files/${record.stored_id}`
    };
  } catch {
    return null;
  }
}

async function emitProgress(
  onProgress: GarProgressFn | undefined,
  stage: "download" | "ingest" | "info",
  message: string,
  meta?: Record<string, unknown>
) {
  if (!onProgress) return;
  try {
    await onProgress(stage, message, meta);
  } catch {
    // ignore progress errors
  }
}

function buildDownloadTargets(fileLinks: GarFileLink[], primary?: GarFileLink | null) {
  if (primary) return [primary];
  if (fileLinks.length === 0) return [];
  return [fileLinks[0]];
}

function parseDate(value?: string) {
  if (!value) return 0;
  const ts = Date.parse(value);
  if (!Number.isNaN(ts)) return ts;
  // Try dd/mm/yyyy or dd.mm.yyyy
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

function buildGarHeaders(referer?: string, targetUrl?: string) {
  const headers: Record<string, string> = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  };
  if (referer) headers["Referer"] = referer;
  const overrideUA = process.env.GAR_USER_AGENT;
  if (overrideUA) headers["User-Agent"] = overrideUA;
  if (targetUrl) {
    headers["Sec-Fetch-Site"] = "same-origin";
    headers["Sec-Fetch-Mode"] = "navigate";
    applyUneceHeaders(headers, targetUrl);
  }
  return headers;
}

async function shouldSkipFailed(url: string, cooldownMinutes: number) {
  if (!cooldownMinutes || cooldownMinutes <= 0) return false;
  const record = await getGarRecord(url);
  if (!record || record.status !== "failed" || !record.last_attempt) return false;
  const last = Date.parse(record.last_attempt);
  if (Number.isNaN(last)) return false;
  const diffMinutes = (Date.now() - last) / 60000;
  return diffMinutes < cooldownMinutes;
}

async function extractText(buffer: Buffer, ext?: string): Promise<string> {
  const normalized = (ext || "").toLowerCase();
  if (normalized === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }
  if (normalized === "pdf") {
    const result = await pdfParse(buffer);
    return result.text || "";
  }
  return "";
}

function pickPrimaryFile(files: GarFileLink[]): GarFileLink | null {
  if (!files || files.length === 0) return null;
  const preferSource = (source?: string) => files.filter((f) => f.source === source);
  const orderByExt = (list: GarFileLink[]) => {
    const byExt = (ext: string) => list.find((f) => (f.ext || "").toLowerCase() === ext);
    return (
      byExt("docx") ||
      byExt("pdf") ||
      byExt("pptx") ||
      byExt("xls") ||
      byExt("xlsx") ||
      list[0] ||
      null
    );
  };
  return (
    orderByExt(preferSource("GAR")) ||
    orderByExt(preferSource("UNECE")) ||
    orderByExt(files)
  );
}

function applyUneceHeaders(headers: Record<string, string>, targetUrl: string) {
  let host = "";
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return;
  }
  if (!host.includes("unece.org")) return;
  const ua = process.env.UNECE_USER_AGENT;
  const cookie = process.env.UNECE_COOKIE;
  const referer = process.env.UNECE_REFERER;
  if (ua) headers["User-Agent"] = ua;
  if (cookie) headers["Cookie"] = cookie;
  if (referer) headers["Referer"] = referer;
}

function extractMetadata($: cheerio.CheerioAPI, title: string) {
  const lookup = (label: string) => {
    const needle = label.toLowerCase();
    const candidates = $("tr, li, p, div").toArray();
    for (const el of candidates) {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (text.toLowerCase().includes(needle)) {
        const cleaned = text.replace(new RegExp(label, "i"), "").replace(/[:：]/, "").trim();
        if (cleaned) return cleaned;
      }
    }
    const dt = $("dt").filter((_, el) => $(el).text().toLowerCase().includes(needle)).first();
    if (dt.length) {
      const dd = dt.next("dd");
      if (dd.length) return dd.text().replace(/\s+/g, " ").trim();
    }
    return "";
  };

  const reference_number = lookup("Reference Number") || lookup("Reference no") || lookup("Reference");
  const submitted_by = lookup("Submitted by") || lookup("Submitted");
  const meeting_sessions = lookup("Meeting Session") || lookup("Meeting Sessions") || lookup("Session");
  const document_date = lookup("Document date") || lookup("Date");
  const relevantToRaw = lookup("Relevant to");
  const relevant_to = relevantToRaw
    ? relevantToRaw.split(/[,;]+/).map((v) => v.trim()).filter(Boolean)
    : [];

  const docType = (() => {
    const lower = title.toLowerCase();
    if (lower.includes("agenda")) return "Agenda";
    if (lower.includes("report")) return "Report";
    if (lower.includes("proposal")) return "Proposal";
    if (lower.includes("minutes")) return "Minutes";
    if (lower.includes("presentation")) return "Presentation";
    return "";
  })();

  return {
    reference_number: reference_number || undefined,
    submitted_by: submitted_by || undefined,
    meeting_sessions: meeting_sessions || undefined,
    document_date: document_date || undefined,
    relevant_to: relevant_to.length ? relevant_to : undefined,
    document_type: docType || undefined
  };
}
