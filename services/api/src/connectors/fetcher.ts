import robotsParser from "robots-parser";
import { loadPolicy, getCrawlerConfig, canonicalizeUrl } from "../ontology/policy";

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();
const rateState = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url: string): Promise<{ url: string; html: string }> {
  const policy = await loadPolicy();
  const crawler = getCrawlerConfig(policy);
  const canonicalUrl = canonicalizeUrl(url, policy);
  const parsed = new URL(canonicalUrl);

  await enforceRobots(parsed, crawler.user_agent, crawler.robots_txt_enforced);
  await enforceRateLimit(parsed.hostname, crawler.rate_limit?.per_domain_rps);

  const res = await fetch(canonicalUrl, {
    headers: { "User-Agent": crawler.user_agent }
  });

  const html = await res.text();
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${canonicalUrl}`);
  }
  if (crawler.deny_on_captcha_or_anti_bot && looksLikeCaptcha(html)) {
    throw new Error(`Captcha or anti-bot detected for ${canonicalUrl}`);
  }

  return { url: canonicalUrl, html };
}

export async function fetchBuffer(url: string): Promise<{ url: string; buffer: Buffer }> {
  const policy = await loadPolicy();
  const crawler = getCrawlerConfig(policy);
  const canonicalUrl = canonicalizeUrl(url, policy);
  const parsed = new URL(canonicalUrl);

  await enforceRobots(parsed, crawler.user_agent, crawler.robots_txt_enforced);
  await enforceRateLimit(parsed.hostname, crawler.rate_limit?.per_domain_rps);

  const res = await fetch(canonicalUrl, {
    headers: { "User-Agent": crawler.user_agent }
  });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${canonicalUrl}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { url: canonicalUrl, buffer };
}

async function enforceRateLimit(domain: string, rps = 1) {
  const interval = Math.max(1000 / rps, 0);
  const now = Date.now();
  const nextAllowed = rateState.get(domain) ?? 0;
  if (now < nextAllowed) {
    await sleep(nextAllowed - now);
  }
  rateState.set(domain, Date.now() + interval);
}

async function enforceRobots(url: URL, userAgent: string, enabled: boolean) {
  if (!enabled) return;
  const domain = url.hostname.replace("www.", "");
  let parser = robotsCache.get(domain);
  if (!parser) {
    const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
    let body = "";
    try {
      const res = await fetch(robotsUrl, { headers: { "User-Agent": userAgent } });
      if (res.ok) {
        body = await res.text();
      }
    } catch {
      body = "";
    }
    parser = robotsParser(robotsUrl, body);
    robotsCache.set(domain, parser);
  }
  if (!parser.isAllowed(url.toString(), userAgent)) {
    throw new Error(`Blocked by robots.txt for ${url.toString()}`);
  }
}

function looksLikeCaptcha(html: string) {
  const lower = html.toLowerCase();
  return lower.includes("captcha") || lower.includes("access denied") || lower.includes("bot detection");
}
