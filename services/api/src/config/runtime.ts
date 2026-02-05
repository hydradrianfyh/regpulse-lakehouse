import { query } from "../db";

export interface RuntimeConfig {
  openai_api_key?: string;
  openai_model?: string;
  reasoning_effort?: "low" | "medium" | "high";
  confidence_min?: number;
}

const defaults: RuntimeConfig = {
  openai_api_key: process.env.OPENAI_API_KEY || undefined,
  openai_model: process.env.OPENAI_MODEL || "gpt-5.2",
  reasoning_effort: (process.env.REASONING_EFFORT as RuntimeConfig["reasoning_effort"]) || "medium",
  confidence_min: Number(process.env.CONFIDENCE_MIN || "0.7")
};

const CONFIG_KEYS = ["openai_api_key", "openai_model", "reasoning_effort", "confidence_min"] as const;
let appConfigReady = false;

let overrides: RuntimeConfig = {};

export function getRuntimeConfig(): Required<RuntimeConfig> {
  return {
    openai_api_key: overrides.openai_api_key ?? defaults.openai_api_key ?? "",
    openai_model: overrides.openai_model ?? defaults.openai_model ?? "gpt-5.2",
    reasoning_effort: overrides.reasoning_effort ?? defaults.reasoning_effort ?? "medium",
    confidence_min: overrides.confidence_min ?? defaults.confidence_min ?? 0.7
  };
}

export async function loadRuntimeConfig(): Promise<void> {
  try {
    await ensureAppConfigTable();
    const { rows } = await query<{ key: string; value: string }>(
      "SELECT key, value FROM app_config WHERE key = ANY($1::text[])",
      [CONFIG_KEYS]
    );

    const next: RuntimeConfig = {};
    for (const row of rows) {
      switch (row.key) {
        case "openai_api_key":
          next.openai_api_key = row.value ?? "";
          break;
        case "openai_model":
          next.openai_model = row.value ?? "";
          break;
        case "reasoning_effort":
          if (row.value === "low" || row.value === "medium" || row.value === "high") {
            next.reasoning_effort = row.value;
          }
          break;
        case "confidence_min":
          next.confidence_min = Number(row.value);
          break;
        default:
          break;
      }
    }

    overrides = next;
  } catch {
    // Ignore when table doesn't exist yet or DB isn't ready.
  }
}

export async function setRuntimeConfig(update: RuntimeConfig) {
  overrides = { ...overrides, ...update };
  await ensureAppConfigTable();

  const entries: Array<[string, string]> = [];
  if (update.openai_api_key !== undefined) entries.push(["openai_api_key", String(update.openai_api_key)]);
  if (update.openai_model !== undefined) entries.push(["openai_model", String(update.openai_model)]);
  if (update.reasoning_effort !== undefined) entries.push(["reasoning_effort", String(update.reasoning_effort)]);
  if (update.confidence_min !== undefined) entries.push(["confidence_min", String(update.confidence_min)]);

  if (entries.length === 0) return;

  for (const [key, value] of entries) {
    await query(
      "INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
      [key, value]
    );
  }
}

async function ensureAppConfigTable(): Promise<void> {
  if (appConfigReady) return;
  await query(
    "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())"
  );
  appConfigReady = true;
}
