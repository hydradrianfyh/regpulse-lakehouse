import { z } from "zod";
import {
  ALLOWED_DOMAINS,
  RegulationItemSchema,
  RequirementSchema,
  EvidenceSchema
} from "@regpulse/ontology";
import { getRuntimeConfig } from "../config/runtime";

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  reason?: string;
  errors?: string[];
}

export function isAllowedDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return ALLOWED_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

export function validateRegulationItem(raw: unknown): ValidationResult<z.infer<typeof RegulationItemSchema>> {
  const parsed = RegulationItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "Schema validation failed", errors: parsed.error.errors.map(e => e.message) };
  }

  const item = parsed.data;
  if (!isAllowedDomain(item.url)) {
    return { ok: false, reason: "Source domain not allowed" };
  }

  const evidenceCheck = EvidenceSchema.safeParse(item.evidence);
  if (!evidenceCheck.success || evidenceCheck.data.citations.length === 0) {
    return { ok: false, reason: "Missing evidence citations" };
  }

  const { confidence_min } = getRuntimeConfig();
  if (item.confidence < confidence_min) {
    return { ok: false, reason: `Confidence below threshold (${confidence_min})` };
  }

  return { ok: true, data: item };
}

export function validateRequirement(raw: unknown): ValidationResult<z.infer<typeof RequirementSchema>> {
  const parsed = RequirementSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "Requirement schema validation failed", errors: parsed.error.errors.map(e => e.message) };
  }
  return { ok: true, data: parsed.data };
}
