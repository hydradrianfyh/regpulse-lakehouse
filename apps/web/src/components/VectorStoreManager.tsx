import { useEffect, useState } from "react";
import { cn } from "../utils/cn";
import {
  getVectorStoreStats,
  getVectorStoreDocuments,
  deleteVectorStoreDocument,
  clearVectorStore,
  getVectorStores,
  createVectorStore,
  deleteVectorStore
} from "../lib/api-client";

interface VectorStoreStats {
  total_chunks: number;
  documents: number;
  last_ingested_at: string | null;
}

interface VectorDocumentRow {
  id: string;
  title?: string | null;
  url: string;
  domain: string;
  chunk_count: number;
  last_ingested_at: string | null;
}

interface VectorStoreRow {
  id: string;
  name: string;
  provider: string;
  external_id?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export function VectorStoreManager() {
  const [stats, setStats] = useState<VectorStoreStats | null>(null);
  const [documents, setDocuments] = useState<VectorDocumentRow[]>([]);
  const [stores, setStores] = useState<VectorStoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [storeName, setStoreName] = useState("");
  const [storeProvider, setStoreProvider] = useState("openai");
  const [externalId, setExternalId] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, docsRes, storesRes] = await Promise.all([
        getVectorStoreStats(),
        getVectorStoreDocuments(),
        getVectorStores()
      ]);
      setStats(statsRes.stats);
      setDocuments(docsRes.documents || []);
      setStores(storesRes.stores || []);
    } catch (err: any) {
      setError(err.message || "加载向量库失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleClear = async () => {
    await clearVectorStore();
    await refresh();
  };

  const handleDeleteDoc = async (id: string) => {
    await deleteVectorStoreDocument(id);
    await refresh();
  };

  const handleCreateStore = async () => {
    if (!storeName.trim()) {
      setError("请输入向量库名称");
      return;
    }
    await createVectorStore({ name: storeName.trim(), provider: storeProvider, external_id: externalId || undefined });
    setStoreName("");
    setExternalId("");
    await refresh();
  };

  const handleDeleteStore = async (id: string) => {
    await deleteVectorStore(id);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">向量库管理</h2>
        <p className="mt-1 text-slate-500">查看本地向量库状态，并登记外部 Vector Store（用于 file_search）</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">本地向量库概览</h3>
          <button
            onClick={refresh}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            刷新
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-slate-500">加载中...</div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">向量块数量</div>
              <div className="text-2xl font-bold text-slate-900">{stats?.total_chunks ?? 0}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">文档数量</div>
              <div className="text-2xl font-bold text-slate-900">{stats?.documents ?? 0}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">最近入库</div>
              <div className="text-sm font-medium text-slate-900">
                {stats?.last_ingested_at ? new Date(stats.last_ingested_at).toLocaleString("zh-CN") : "-"}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={handleClear}
            className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            清空本地向量库
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">向量化文档</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-3 py-2">标题</th>
                <th className="px-3 py-2">域名</th>
                <th className="px-3 py-2">向量块</th>
                <th className="px-3 py-2">最近入库</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{doc.title || doc.url}</div>
                    <div className="text-xs text-slate-500">{doc.url}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{doc.domain}</td>
                  <td className="px-3 py-2 text-slate-700">{doc.chunk_count}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {doc.last_ingested_at ? new Date(doc.last_ingested_at).toLocaleString("zh-CN") : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      删除向量
                    </button>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    暂无向量化文档
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">外部 Vector Store</h3>
          <span className="text-xs text-slate-500">用于 file_search / 合并上下文</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="名称"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={storeProvider}
            onChange={(e) => setStoreProvider(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="openai">OpenAI</option>
            <option value="custom">Custom</option>
          </select>
          <input
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="Vector Store ID (vs_...)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="mt-3">
          <button
            onClick={handleCreateStore}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            登记向量库
          </button>
        </div>

        <div className="mt-6 divide-y divide-slate-100">
          {stores.map((store) => (
            <div key={store.id} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                    store.provider === "local" ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"
                  )}>
                    {store.provider}
                  </span>
                  <span className="font-medium text-slate-900">{store.name}</span>
                </div>
                {store.external_id && (
                  <div className="mt-1 text-xs text-slate-500">{store.external_id}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  {store.created_at ? new Date(store.created_at).toLocaleDateString("zh-CN") : ""}
                </span>
                {store.provider !== "local" && (
                  <button
                    onClick={() => handleDeleteStore(store.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
          {stores.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">
              暂无登记的向量库
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
