const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers || {}) as Record<string, string>
  };
  if (options.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function getConfig() {
  return request<{
    openai_configured: boolean;
    allowed_domains: string[];
    reasoning_effort: "low" | "medium" | "high";
    confidence_min: number;
    openai_model: string;
  }>("/api/config");
}

export async function updateConfig(payload: {
  openai_api_key?: string;
  openai_model?: string;
  reasoning_effort?: "low" | "medium" | "high";
  confidence_min?: number;
}) {
  return request<{
    openai_configured: boolean;
    allowed_domains: string[];
    reasoning_effort: "low" | "medium" | "high";
    confidence_min: number;
    openai_model: string;
  }>("/api/config", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getItems() {
  return request<{ items: any[] }>("/api/items");
}

export async function getRuns() {
  return request<{ runs: any[] }>("/api/runs");
}

export async function getRunLogs(runId: string) {
  return request<{ logs: any[] }>(`/api/runs/${runId}/logs`);
}

export async function getRunDocuments(runId: string) {
  return request<{ documents: any[] }>(`/api/runs/${runId}/documents`);
}

export async function triggerScan(payload: { jurisdiction: string; days: number; query?: string; max_results?: number }) {
  return request<any>("/api/runs/scan", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function triggerMerge(payload: { jurisdiction: string; enable_file_search?: boolean; vector_store_id?: string }) {
  return request<any>("/api/runs/merge", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getReviewQueue() {
  return request<{ items: any[] }>("/api/review-queue");
}

export async function getOntology() {
  return request<{
    jurisdictions: string[];
    source_types: string[];
    statuses: string[];
    topics: string[];
    impacted_areas: string[];
    priorities: string[];
    trust_tiers: string[];
    monitoring_stages: string[];
    allowed_domains: string[];
  }>("/api/ontology");
}

export async function approveReview(id: string) {
  return request<{ status: string }>(`/api/review-queue/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function rejectReview(id: string) {
  return request<{ status: string }>(`/api/review-queue/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function clearData() {
  return request<{ status: string }>("/api/admin/clear", { method: "POST" });
}

export async function verifyEvidence(payload: Record<string, unknown>) {
  return request<{ success: boolean; message: string; details?: string }>("/api/evidence/verify", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getVectorStoreStats() {
  return request<{ stats: any }>("/api/vector-store/stats");
}

export async function getVectorStoreDocuments() {
  return request<{ documents: any[] }>("/api/vector-store/documents");
}

export async function deleteVectorStoreDocument(id: string) {
  return request<{ status: string }>(`/api/vector-store/documents/${id}`, { method: "DELETE" });
}

export async function clearVectorStore() {
  return request<{ status: string }>("/api/vector-store/clear", { method: "POST" });
}

export async function getVectorStores() {
  return request<{ stores: any[] }>("/api/vector-stores");
}

export async function getOpenAIVectorStores() {
  return request<{ stores: Array<{ id: string; name: string; status: string; usage_bytes?: number }> }>("/api/openai/vector-stores");
}

export async function createVectorStore(payload: { name: string; provider: string; external_id?: string }) {
  return request<{ id: string }>("/api/vector-stores", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteVectorStore(id: string) {
  return request<{ status: string }>(`/api/vector-stores/${id}`, { method: "DELETE" });
}

export async function getLineage() {
  return request<{ nodes: any[]; edges: any[] }>("/api/lineage");
}
