import robotsParser from "robots-parser";
import { loadPolicy, getCrawlerConfig, canonicalizeUrl } from "../ontology/policy";

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();
const rateState = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url: string, options: FetchOptions = {}): Promise<{ url: string; html: string }> {
  const policy = await loadPolicy();
  const crawler = getCrawlerConfig(policy);
  const canonicalUrl = canonicalizeUrl(url, policy);
  const parsed = new URL(canonicalUrl);

  const userAgent = resolveUserAgent(parsed.hostname, crawler.user_agent, options.headers);
  await enforceRobots(parsed, userAgent, crawler.robots_txt_enforced);
  await enforceRateLimit(parsed.hostname, resolveRateLimit(parsed.hostname, crawler.rate_limit?.per_domain_rps));

  const headers = {
    "User-Agent": userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...(options.headers || {})
  };
  applyUneceHeaders(headers, canonicalUrl);
  const res = await fetchWithRetry(
    canonicalUrl,
    { headers },
    options.timeoutMs ?? 20000,
    options.retries ?? 2
  );

  const html = await res.text();
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${canonicalUrl}`);
  }
  if (crawler.deny_on_captcha_or_anti_bot && looksLikeCaptcha(html)) {
    throw new Error(`Captcha or anti-bot detected for ${canonicalUrl}`);
  }

  return { url: canonicalUrl, html };
}

export async function fetchBuffer(url: string, options: FetchOptions = {}): Promise<{ url: string; buffer: Buffer }> {
  const policy = await loadPolicy();
  const crawler = getCrawlerConfig(policy);
  const canonicalUrl = canonicalizeUrl(url, policy);
  const parsed = new URL(canonicalUrl);

  const userAgent = resolveUserAgent(parsed.hostname, crawler.user_agent, options.headers);
  await enforceRobots(parsed, userAgent, crawler.robots_txt_enforced);
  await enforceRateLimit(parsed.hostname, resolveRateLimit(parsed.hostname, crawler.rate_limit?.per_domain_rps));

  const headers = {
    "User-Agent": userAgent,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    ...(options.headers || {})
  };
  applyUneceHeaders(headers, canonicalUrl);
  const res = await fetchWithRetry(
    canonicalUrl,
    { headers },
    options.timeoutMs ?? 30000,
    options.retries ?? 2
  );
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${canonicalUrl}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { url: canonicalUrl, buffer };
}

async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, retries: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok && attempt < retries) {
        lastError = new Error(`Fetch failed (${res.status}) for ${url}`);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt >= retries) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Fetch failed");
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

function resolveRateLimit(hostname: string, defaultRps?: number) {
  let rps = typeof defaultRps === "number" ? defaultRps : 1;
  if (hostname.includes("globalautoregs.com")) {
    const override = Number(process.env.GAR_RATE_LIMIT_RPS || 1);
    if (!Number.isNaN(override) && override > 0) {
      rps = override;
    } else {
      rps = 1;
    }
  }
  return rps;
}

function resolveUserAgent(hostname: string, defaultUa: string, headers?: Record<string, string>) {
  const explicit = headers?.["User-Agent"] || headers?.["user-agent"];
  if (explicit) return explicit;
  if (hostname.includes("unece.org")) {
    const uneceUa = process.env.UNECE_USER_AGENT;
    if (uneceUa) return uneceUa;
  }
  return defaultUa;
}

function applyUneceHeaders(headers: Record<string, string>, url: string) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
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
