import * as cheerio from "cheerio";
import { fetchHtml } from "./fetcher";

export interface NewsDocument {
  url: string;
  title: string;
  content: string;
  published_date?: string;
}

export async function fetchEUNewsList(listUrl: string, maxItems = 10): Promise<NewsDocument[]> {
  const { html } = await fetchHtml(listUrl);
  const $ = cheerio.load(html);

  const links = new Set<string>();
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#")) return;
    if (href.includes("mailto:")) return;
    if (href.includes("javascript:")) return;
    if (href.startsWith("/")) {
      const base = new URL(listUrl);
      links.add(`${base.origin}${href}`);
    } else if (href.startsWith("http")) {
      links.add(href);
    }
  });

  const filtered = Array.from(links).filter((link) => {
    if (listUrl.includes("commission.europa.eu")) {
      return link.includes("commission.europa.eu") && link.includes("/news/");
    }
    if (listUrl.includes("futurium.ec.europa.eu")) {
      return link.includes("futurium.ec.europa.eu") && link.includes("/news/");
    }
    if (listUrl.includes("digital-strategy.ec.europa.eu")) {
      return link.includes("digital-strategy.ec.europa.eu") && link.includes("/en/news");
    }
    return true;
  });

  const results: NewsDocument[] = [];
  for (const link of filtered.slice(0, maxItems)) {
    try {
      const doc = await fetchArticle(link);
      if (doc) results.push(doc);
    } catch {
      continue;
    }
  }
  return results;
}

async function fetchArticle(url: string): Promise<NewsDocument | null> {
  const { html } = await fetchHtml(url);
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

  const content = extractMainText($, description);

  return {
    url,
    title,
    content: content.slice(0, 4000),
    published_date: published ? published.slice(0, 10) : undefined
  };
}

function extractMainText($: cheerio.CheerioAPI, fallback?: string) {
  const paragraphs = $("article p")
    .toArray()
    .map((p) => $(p).text().trim())
    .filter(Boolean);
  if (paragraphs.length > 0) {
    return paragraphs.join("\n");
  }
  return fallback || "";
}
