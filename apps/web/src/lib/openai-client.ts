/**
 * Deprecated in full-stack mode.
 * Frontend should call backend APIs via api-client.
 */

import type { RegPulseItem, Jurisdiction } from '@regpulse/shared';
import { getConfig, triggerScan } from './api-client';

let cachedConfig: { openai_configured: boolean } | null = null;

export async function refreshConfig() {
  cachedConfig = await getConfig();
  return cachedConfig;
}

export function isApiKeyConfigured(): boolean {
  return cachedConfig?.openai_configured ?? false;
}

export async function discoverRegulations(
  jurisdiction: Jurisdiction,
  days: number,
  onProgress?: (stage: string, message: string) => void
): Promise<{ discovered: number; items: Partial<RegPulseItem>[]; errors: string[] }> {
  onProgress?.('detect', 'Delegated to backend scan pipeline');
  const result = await triggerScan({ jurisdiction, days });
  return {
    discovered: result.discovered || 0,
    items: result.items || [],
    errors: result.errors || []
  };
}

export async function searchRegulations(): Promise<never> {
  throw new Error('searchRegulations is deprecated in full-stack mode');
}

export async function extractRegulationItem(): Promise<never> {
  throw new Error('extractRegulationItem is deprecated in full-stack mode');
}

export async function validateApiKey(): Promise<{ valid: boolean; error?: string }> {
  const cfg = await getConfig();
  return { valid: cfg.openai_configured };
}

export function storeApiKey(): void {
  // no-op
}

export function clearApiKey(): void {
  // no-op
}

export function createOpenAIClient(): null {
  return null;
}
