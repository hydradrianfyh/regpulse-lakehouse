import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';
import type { RegPulseItem, Jurisdiction } from '@regpulse/shared';
import { triggerMerge, getOpenAIVectorStores } from '../lib/api-client';

interface MergePanelProps {
  apiConfigured: boolean;
  onAfterMerge: () => void;
}

export interface MergeResult {
  mergedItems: RegPulseItem[];
  radarTable: RadarTableEntry[];
  dataGaps: DataGap[];
  summary: string;
  processedAt: string;
}

export interface RadarTableEntry {
  requirementFamily: string;
  markets: string[];
  vehicleTypes: string[];
  functions: string[];
  owner: string;
  evidenceStatus: 'complete' | 'partial' | 'missing';
  priority: string;
}

export interface DataGap {
  area: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

export function MergePanel({ apiConfigured, onAfterMerge }: MergePanelProps) {
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState<{ stage: 'idle' | 'merging' | 'complete' | 'error'; message: string }>({
    stage: 'idle',
    message: ''
  });
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const [targetJurisdiction, setTargetJurisdiction] = useState<Jurisdiction>('EU');
  const [enableFileSearch, setEnableFileSearch] = useState(false);
  const [vectorStoreId, setVectorStoreId] = useState('');
  const [vectorStores, setVectorStores] = useState<{ id: string; name: string; status?: string }[]>([]);

  useEffect(() => {
    if (!enableFileSearch) return;
    const loadStores = async () => {
      try {
        const result = await getOpenAIVectorStores();
        setVectorStores(result.stores || []);
      } catch {
        setVectorStores([]);
      }
    };
    loadStores();
  }, [enableFileSearch]);

  const handleMerge = async () => {
    if (!apiConfigured) {
      setProgress({ stage: 'error', message: '后端未配置 OpenAI API Key' });
      return;
    }

    setIsMerging(true);
    setMergeResult(null);
    setJobId(null);
    setProgress({ stage: 'merging', message: '正在进行本体化合并...' });

    try {
      const result = await triggerMerge({
        jurisdiction: targetJurisdiction,
        enable_file_search: enableFileSearch,
        vector_store_id: vectorStoreId || undefined
      });

      setJobId(result.job_id || null);
      setProgress({ stage: 'complete', message: `任务已提交，Job: ${result.job_id || 'pending'}。请在运行监控中查看进度。` });
      onAfterMerge();
    } catch (error: any) {
      setProgress({ stage: 'error', message: error.message || '合并失败' });
    } finally {
      setIsMerging(false);
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'merging': return 'text-purple-600';
      case 'complete': return 'text-green-700';
      case 'error': return 'text-red-600';
      default: return 'text-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">归并与雷达表</h2>
        <p className="mt-1 text-slate-500">
          通过后端 GPT + Ontology 合并条目，输出 Coverage Matrix 与数据缺口
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <SettingsIcon className="h-5 w-5 text-slate-400" />
          归并配置
        </h3>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">目标市场</label>
              <select
                value={targetJurisdiction}
                onChange={(e) => setTargetJurisdiction(e.target.value as Jurisdiction)}
                disabled={isMerging}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="EU">European Union (EU)</option>
                <option value="UN_ECE">UN ECE (WP.29)</option>
                <option value="DE">Germany (DE)</option>
                <option value="FR">France (FR)</option>
                <option value="UK">United Kingdom (UK)</option>
                <option value="ES">Spain (ES)</option>
                <option value="IT">Italy (IT)</option>
                <option value="CZ">Czechia (CZ)</option>
                <option value="PL">Poland (PL)</option>
                <option value="GLOBAL">Global</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableFileSearch}
                onChange={(e) => setEnableFileSearch(e.target.checked)}
                disabled={isMerging}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm font-medium text-slate-700">启用 file_search（可选）</span>
            </label>

            {enableFileSearch && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">选择 Vector Store</label>
                <select
                  value={vectorStoreId}
                  onChange={(e) => setVectorStoreId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">未选择（可手动输入）</option>
                  {vectorStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.id}) {store.status ? `- ${store.status}` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={vectorStoreId}
                  onChange={(e) => setVectorStoreId(e.target.value)}
                  placeholder="或输入 vs_..."
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-500">仅 OpenAI Vector Store 可用于 file_search，本地向量库不适用。</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleMerge}
            disabled={isMerging}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white',
              isMerging ? 'cursor-not-allowed bg-slate-400' : 'bg-purple-600 hover:bg-purple-700'
            )}
          >
            {isMerging ? (
              <>
                <LoadingIcon className="h-4 w-4 animate-spin" />
                归并中...
              </>
            ) : (
              <>
                <MergeIcon className="h-4 w-4" />
                开始归并
              </>
            )}
          </button>

          {progress.stage !== 'idle' && (
            <div className={cn('flex items-center gap-2 text-sm', getStageColor(progress.stage))}>
              <span>{progress.message}</span>
            </div>
          )}
        </div>
      </div>

      {jobId && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-2 text-lg font-semibold text-slate-900">任务已入队</h3>
          <p className="text-sm text-slate-600">Job ID: {jobId}</p>
          <p className="mt-2 text-sm text-slate-500">运行完成后可在运行监控与法规浏览中查看结果。</p>
        </div>
      )}

      {mergeResult && (
        <>
          <div className="rounded-xl border border-green-200 bg-green-50 p-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-green-800">
              <CheckIcon className="h-5 w-5" />
              归并完成
            </h3>
            <p className="text-green-700">{mergeResult.summary}</p>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-white p-4 text-center">
                <div className="text-2xl font-bold text-slate-900">{mergeResult.mergedItems.length}</div>
                <div className="text-sm text-slate-500">归并后条目</div>
              </div>
              <div className="rounded-lg bg-white p-4 text-center">
                <div className="text-2xl font-bold text-slate-900">{mergeResult.radarTable.length}</div>
                <div className="text-sm text-slate-500">雷达表条目</div>
              </div>
              <div className="rounded-lg bg-white p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{mergeResult.dataGaps.length}</div>
                <div className="text-sm text-slate-500">数据缺口</div>
              </div>
            </div>
          </div>

          {mergeResult.radarTable.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <TableIcon className="h-5 w-5 text-slate-400" />
                雷达表 (Coverage Matrix)
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium text-slate-700">法规要求族</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">市场</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">功能</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Owner</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">证据状态</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">优先级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergeResult.radarTable.map((entry, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{entry.requirementFamily}</td>
                        <td className="px-4 py-3">
                          {entry.markets.map((m, j) => (
                            <span key={j} className="mr-1 inline-flex rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                              {m}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3">
                          {entry.functions.slice(0, 2).map((f, j) => (
                            <span key={j} className="mr-1 inline-flex rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                              {f}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{entry.owner}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            entry.evidenceStatus === 'complete' ? 'bg-green-100 text-green-700' :
                            entry.evidenceStatus === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          )}>
                            {entry.evidenceStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
                            entry.priority === 'P0' ? 'bg-red-100 text-red-700' :
                            entry.priority === 'P1' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          )}>
                            {entry.priority}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mergeResult.dataGaps.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-red-800">
                <AlertIcon className="h-5 w-5" />
                数据缺口
              </h3>
              <div className="space-y-3">
                {mergeResult.dataGaps.map((gap, i) => (
                  <div key={i} className="rounded-lg bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            gap.severity === 'high' ? 'bg-red-100 text-red-700' :
                            gap.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          )}>
                            {gap.severity}
                          </span>
                          <span className="font-medium text-slate-900">{gap.area}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{gap.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded bg-slate-50 p-2">
                      <p className="text-sm text-slate-700">
                        <strong>建议:</strong> {gap.recommendation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <DocumentIcon className="h-5 w-5 text-slate-400" />
              归并后的法规条目 ({mergeResult.mergedItems.length})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {mergeResult.mergedItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
                      item.priority === 'P0' ? 'bg-red-100 text-red-700' :
                      item.priority === 'P1' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    )}>
                      {item.priority}
                    </span>
                    <span className="text-xs text-slate-500">{item.jurisdiction}</span>
                    <span className="text-xs text-slate-500">{item.source_org}</span>
                  </div>
                  <h4 className="mt-1 font-medium text-slate-900">{item.title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{item.summary_1line}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.topics.slice(0, 3).map((topic) => (
                      <span key={topic} className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                        {topic.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function MergeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}
