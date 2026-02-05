import * as cheerio from "cheerio";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { fetchBuffer, fetchHtml } from "./fetcher";

export interface GarDocument {
  url: string;
  title: string;
  content: string;
  published_date?: string;
  raw_file_uri?: string;
}

export async function fetchGlobalAutoRegs(listUrl: string, maxItems = 10): Promise<GarDocument[]> {
  const { html } = await fetchHtml(listUrl);
  const $ = cheerio.load(html);

  const links = new Set<string>();
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#")) return;
    if (href.includes("mailto:")) return;
    if (href.startsWith("/")) {
      const base = new URL(listUrl);
      links.add(`${base.origin}${href}`);
    } else if (href.startsWith("http")) {
      links.add(href);
    }
  });

  const filtered = Array.from(links).filter((link) => {
    if (!link.includes("globalautoregs.com")) return false;
    if (listUrl.includes("/documents")) {
      return link.includes("/documents/");
    }
    if (listUrl.includes("/modifications")) {
      return link.includes("/modifications/");
    }
    return true;
  });

  const results: GarDocument[] = [];
  for (const link of filtered.slice(0, maxItems)) {
    try {
      const doc = await fetchDocument(link);
      if (doc) results.push(doc);
    } catch {
      continue;
    }
  }
  return results;
}

async function fetchDocument(url: string): Promise<GarDocument | null> {
  const { html } = await fetchHtml(url);
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

  const fileLink = findFileLink($, url);
  let content = "";
  let rawFileUri: string | undefined;

  if (fileLink) {
    rawFileUri = fileLink;
    content = await downloadAndExtract(fileLink);
  } else {
    const paragraphs = $("p")
      .toArray()
      .map((p) => $(p).text().trim())
      .filter(Boolean);
    content = paragraphs.slice(0, 10).join("\n");
  }

  return {
    url,
    title,
    content: content.slice(0, 4000),
    published_date: published ? published.slice(0, 10) : undefined,
    raw_file_uri: rawFileUri
  };
}

function findFileLink($: cheerio.CheerioAPI, baseUrl: string): string | null {
  let docx: string | null = null;
  let pdf: string | null = null;

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const normalized = href.startsWith("/")
      ? `${new URL(baseUrl).origin}${href}`
      : href;
    if (normalized.endsWith(".docx")) docx = normalized;
    if (normalized.endsWith(".pdf")) pdf = normalized;
  });

  return docx || pdf;
}

async function downloadAndExtract(fileUrl: string): Promise<string> {
  const { buffer } = await fetchBuffer(fileUrl);
  if (fileUrl.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }
  if (fileUrl.endsWith(".pdf")) {
    const result = await pdfParse(buffer);
    return result.text || "";
  }
  return "";
}
