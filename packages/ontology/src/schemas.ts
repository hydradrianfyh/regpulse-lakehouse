import { z } from "zod";
import {
  JURISDICTIONS,
  SOURCE_TYPES,
  ITEM_STATUSES,
  TOPICS,
  IMPACTED_AREAS,
  PRIORITIES,
  TRUST_TIERS,
  MONITORING_STAGES,
  EVIDENCE_STATUS,
  REVIEW_STATUS,
  RUN_STATUS
} from "./terms";

export const EngineeringActionSchema = z.object({
  action: z.string().min(1),
  owner_role: z.string().min(1),
  due_date: z.string().nullable(),
  artifact: z.string().min(1)
});

export const CitationSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().optional()
});

export const EvidenceSchema = z.object({
  raw_file_uri: z.string().nullable(),
  text_snapshot_uri: z.string().nullable(),
  citations: z.array(CitationSchema).default([])
});

export const SourceDocumentSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  retrieved_at: z.string().datetime(),
  hash: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const RegulationItemSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  jurisdiction: z.enum(JURISDICTIONS),
  source_org: z.string().min(1),
  source_type: z.enum(SOURCE_TYPES),
  title: z.string().min(1),
  summary_1line: z.string().min(1).max(400),
  url: z.string().url(),
  published_date: z.string().nullable(),
  retrieved_at: z.string().datetime(),
  effective_date: z.string().nullable(),
  status: z.enum(ITEM_STATUSES),
  topics: z.array(z.enum(TOPICS)).default([]),
  impacted_areas: z.array(z.enum(IMPACTED_AREAS)).default([]),
  engineering_actions: z.array(EngineeringActionSchema).default([]),
  evidence: EvidenceSchema,
  confidence: z.number().min(0).max(1),
  notes: z.string().default(""),
  priority: z.enum(PRIORITIES),
  source_document_id: z.string().uuid().optional(),
  trust_tier: z.enum(TRUST_TIERS).optional(),
  monitoring_stage: z.enum(MONITORING_STAGES).optional(),
  source_profile_id: z.string().optional()
});

export const RequirementSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)).optional(),
  requirementFamily: z.string().min(1),
  markets: z.array(z.string()).default([]),
  vehicleTypes: z.array(z.string()).default([]),
  functions: z.array(z.string()).default([]),
  owner: z.string().default(""),
  evidenceStatus: z.enum(EVIDENCE_STATUS),
  priority: z.enum(PRIORITIES)
});

export const DataGapSchema = z.object({
  area: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["high", "medium", "low"]),
  recommendation: z.string().min(1)
});

export const RunRecordSchema = z.object({
  id: z.string().uuid(),
  run_type: z.string().min(1),
  jurisdiction: z.enum(JURISDICTIONS),
  days_window: z.number().int(),
  status: z.enum(RUN_STATUS),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
  meta: z.record(z.string(), z.unknown()).optional(),
  job_id: z.string().optional()
});

export const ReviewQueueItemSchema = z.object({
  id: z.string().uuid(),
  entity_type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  status: z.enum(REVIEW_STATUS),
  created_at: z.string().datetime(),
  reviewed_at: z.string().datetime().nullable().optional(),
  reviewer: z.string().optional()
});

export type EngineeringAction = z.infer<typeof EngineeringActionSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type RegulationItem = z.infer<typeof RegulationItemSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type DataGap = z.infer<typeof DataGapSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>;
