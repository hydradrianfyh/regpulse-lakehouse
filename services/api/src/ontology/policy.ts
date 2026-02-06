import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TrustTier =
  | "TIER_A_BINDING"
  | "TIER_B_OFFICIAL_SIGNAL"
  | "TIER_C_SOFT_REQ"
  | "TIER_D_QUARANTINE";

export type MonitoringStage =
  | "Drafting"
  | "Official"
  | "Comitology"
  | "Interpreting"
  | "Use&Registration";

export interface PolicyProfile {
  id: string;
  connector: "eu_news" | "globalautoregs" | "generic_list";
  domain: string;
  path: string;
  required_query_params?: Record<string, string[]>;
  allowed_paths?: string[];
  parsing_rule?: string;
  tier: TrustTier;
  stage: MonitoringStage;
  requires_review?: boolean;
}

interface PolicyConfig {
  version: string;
  crawler: {
    user_agent: string;
    robots_txt_enforced: boolean;
    deny_on_captcha_or_anti_bot: boolean;
    canonicalize: {
      strip_utm_params: boolean;
      normalize_trailing_slash: boolean;
    };
    rate_limit?: {
      per_domain_rps?: number;
      burst?: number;
    };
  };
  monitoring_stages: MonitoringStage[];
  tiers: Record<
    string,
    {
      description?: string;
      allow_auto_extract?: boolean;
      allow_write_main?: boolean;
      route?: string;
      domains?: string[];
    }
  >;
  profiles: PolicyProfile[];
}

export interface SourceEvaluation {
  tier: TrustTier;
  stage: MonitoringStage;
  profile_id?: string;
  requires_review: boolean;
  route: "main" | "review_queue";
  allow_auto_extract?: boolean;
  allow_write_main?: boolean;
  reason?: string;
  canonical_url: string;
}

let cachedPolicy: PolicyConfig | null = null;

export async function loadPolicy(): Promise<PolicyConfig> {
  if (cachedPolicy) return cachedPolicy;
  const policyPath = resolvePolicyPath();
  const raw = await readFile(policyPath, "utf-8");
  cachedPolicy = JSON.parse(raw) as PolicyConfig;
  return cachedPolicy;
}

function resolvePolicyPath() {
  const primary = path.resolve(process.cwd(), "config", "trust-policy.json");
  if (existsSync(primary)) return primary;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../config", "trust-policy.json");
}

export function canonicalizeUrl(url: string, policy: PolicyConfig): string {
  try {
    const parsed = new URL(url);
    if (policy.crawler.canonicalize.strip_utm_params) {
      const params = parsed.searchParams;
      for (const key of Array.from(params.keys())) {
        if (key.toLowerCase().startsWith("utm_")) {
          params.delete(key);
        }
      }
    }
    if (policy.crawler.canonicalize.normalize_trailing_slash) {
      if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function evaluateSource(url: string): Promise<SourceEvaluation> {
  const policy = await loadPolicy();
  const canonicalUrl = canonicalizeUrl(url, policy);
  const parsed = new URL(canonicalUrl);
  const domain = parsed.hostname.replace("www.", "");

  const profile = policy.profiles.find((p) => matchesProfile(p, parsed));
  if (profile) {
    const tierConfig = policy.tiers[profile.tier];
    const allowWriteMain = tierConfig?.allow_write_main ?? profile.tier === "TIER_A_BINDING";
    const allowAutoExtract = tierConfig?.allow_auto_extract ?? true;
    const route = profile.requires_review || !allowWriteMain ? "review_queue" : "main";
    return {
      tier: profile.tier,
      stage: profile.stage,
      profile_id: profile.id,
      requires_review: Boolean(profile.requires_review),
      route,
      allow_auto_extract: allowAutoExtract,
      allow_write_main: allowWriteMain,
      canonical_url: canonicalUrl
    };
  }

  const tierFallback = findTierForDomain(domain, policy);
  if (tierFallback) {
    const tierConfig = policy.tiers[tierFallback];
    const allowWriteMain = tierConfig?.allow_write_main ?? tierFallback === "TIER_A_BINDING";
    const allowAutoExtract = tierConfig?.allow_auto_extract ?? true;
    const route = allowWriteMain ? "main" : "review_queue";
    return {
      tier: tierFallback,
      stage: "Official",
      requires_review: tierFallback !== "TIER_A_BINDING",
      route,
      allow_auto_extract: allowAutoExtract,
      allow_write_main: allowWriteMain,
      reason: "domain_tier_match",
      canonical_url: canonicalUrl
    };
  }

  return {
    tier: "TIER_D_QUARANTINE",
    stage: "Drafting",
    requires_review: true,
    route: "review_queue",
    allow_auto_extract: true,
    allow_write_main: false,
    reason: "unrecognized_domain",
    canonical_url: canonicalUrl
  };
}

export function getProfiles(policy: PolicyConfig) {
  return policy.profiles;
}

export function getCrawlerConfig(policy: PolicyConfig) {
  return policy.crawler;
}

function matchesProfile(profile: PolicyProfile, url: URL): boolean {
  const domain = url.hostname.replace("www.", "");
  if (domain !== profile.domain) return false;
  if (!url.pathname.startsWith(profile.path)) return false;

  if (profile.required_query_params) {
    for (const [key, values] of Object.entries(profile.required_query_params)) {
      const param = url.searchParams.get(key);
      if (!param || !values.includes(param)) return false;
    }
  }
  return true;
}

function findTierForDomain(domain: string, policy: PolicyConfig): TrustTier | null {
  for (const [tier, cfg] of Object.entries(policy.tiers)) {
    if (cfg.domains && cfg.domains.some((d) => domain.includes(d))) {
      return tier as TrustTier;
    }
  }
  return null;
}
