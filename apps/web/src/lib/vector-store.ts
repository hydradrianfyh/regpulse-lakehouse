/**
 * Deprecated in full-stack mode.
 * Vector storage is handled in backend (Postgres + pgvector).
 */

export interface RegulatoryDocument {
  id: string;
  title: string;
  documentNumber?: string;
  type: string;
  url: string;
  content: string;
  jurisdiction: string;
  sourceOrg: string;
  publishedDate?: string;
  retrievedAt: string;
  evidence: string;
  metadata: Record<string, string>;
}

export const vectorStore = {
  addDocuments: async () => 0,
  getStats: () => ({ totalVectors: 0, totalDocuments: 0 }),
  findSimilarGroups: async () => [] as any[],
  search: async () => [] as any[]
};

export const openaiVectorStoreManager = {
  refreshClient: () => {},
  listVectorStores: async () => [],
  createVectorStore: async () => '',
  uploadFileToVectorStore: async () => '',
  fileSearch: async () => ({ answer: '', citations: [] }),
  deleteVectorStore: async () => {}
};
