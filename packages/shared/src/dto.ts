import type {
  RegulationItem,
  SourceDocument,
  Requirement,
  DataGap,
  ReviewQueueItem,
  RunRecord
} from "@regpulse/ontology";

export interface ScanRequest {
  jurisdiction: string;
  days: number;
  query?: string;
  max_results?: number;
}

export interface ScanResponse {
  run: RunRecord;
  discovered: number;
  items: RegulationItem[];
  documents: SourceDocument[];
  errors: string[];
  reviewQueue: ReviewQueueItem[];
}

export interface ScanEnqueueResponse {
  run: RunRecord;
  job_id: string;
  queue: "scan";
}

export interface MergeRequest {
  jurisdiction: string;
  enable_file_search?: boolean;
  vector_store_id?: string;
  dedup_threshold?: number;
}

export interface MergeResponse {
  run: RunRecord;
  mergedItems: RegulationItem[];
  radarTable: Requirement[];
  dataGaps: DataGap[];
  summary: string;
  reviewQueue: ReviewQueueItem[];
}

export interface MergeEnqueueResponse {
  run: RunRecord;
  job_id: string;
  queue: "merge";
}

export interface ItemsResponse {
  items: RegulationItem[];
}

export interface RunsResponse {
  runs: RunRecord[];
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
}

export interface ConfigResponse {
  openai_configured: boolean;
  allowed_domains: string[];
  reasoning_effort: "low" | "medium" | "high";
  confidence_min: number;
}

export interface VectorStore {
  id: string;
  name: string;
  provider: string;
  external_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface VectorStoreStats {
  total_chunks: number;
  documents: number;
  last_ingested_at: string | null;
}

export interface VectorDocument {
  id: string;
  title?: string | null;
  url: string;
  domain: string;
  chunk_count: number;
  last_ingested_at: string | null;
}

export interface VectorStoreStatsResponse {
  stats: VectorStoreStats;
}

export interface VectorStoreDocumentsResponse {
  documents: VectorDocument[];
}

export interface VectorStoresResponse {
  stores: VectorStore[];
}

export interface LineageNode {
  id: string;
  label: string;
  type: string;
  meta?: Record<string, unknown>;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

export interface LineageResponse {
  nodes: LineageNode[];
  edges: LineageEdge[];
}
