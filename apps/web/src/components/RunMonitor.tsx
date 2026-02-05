import { useState, useCallback, useEffect } from 'react';
import { cn } from '../utils/cn';
import type { RunRecord, Jurisdiction } from '@regpulse/shared';
import { triggerScan, getRunLogs } from '../lib/api-client';

interface RunMonitorProps {
  runs: RunRecord[];
  apiConfigured: boolean;
  onAfterRun: () => void;
}

interface ProgressMessage {
  stage: string;
  message: string;
  timestamp: Date;
}

export function RunMonitor({ runs, apiConfigured, onAfterRun }: RunMonitorProps) {
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<Jurisdiction>('EU');
  const [daysWindow, setDaysWindow] = useState(90);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressMessage[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let timer: number | undefined;

    const loadLogs = async () => {
      try {
        const res = await getRunLogs(activeRunId);
        if (cancelled) return;
        const logs = (res.logs || []).map((log: any) => ({
          stage: log.stage || 'detect',
          message: log.message || '',
          timestamp: new Date(log.created_at)
        }));
        if (logs.length > 0) {
          setProgress(logs);
        }
      } catch {
        // ignore transient errors
      }
    };

    loadLogs();
    timer = window.setInterval(loadLogs, 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [activeRunId]);

  useEffect(() => {
    if (activeRunId) {
      setProgress([]);
    }
  }, [activeRunId]);

  useEffect(() => {
    const running = runs.find(r => r.status === 'running' || r.status === 'queued');
    if (running && running.id !== activeRunId) {
      setActiveRunId(running.id);
      return;
    }
    if (!running && runs.length > 0) {
      const latest = runs[0];
      if (latest && latest.id !== activeRunId) {
        setActiveRunId(latest.id);
      }
    }
  }, [runs, activeRunId]);

  const addProgress = useCallback((stage: ProgressMessage['stage'], message: string) => {
    setProgress(prev => [...prev, { stage, message, timestamp: new Date() }]);
  }, []);

  const handleTriggerRun = async () => {
    if (!apiConfigured) {
      addProgress('error', '后端未配置 OpenAI API Key');
      return;
    }

    setIsRunning(true);
    setProgress([]);

    addProgress('detect', `开始采集 ${selectedJurisdiction} 法规（最近 ${daysWindow} 天）`);

    try {
      const result = await triggerScan({
        jurisdiction: selectedJurisdiction,
        days: daysWindow
      });

      if (result?.run?.id) {
        setActiveRunId(result.run.id);
      }

      addProgress('queued', `任务已入队，Job: ${result.job_id || 'pending'}`);
      onAfterRun();
    } catch (error: any) {
      addProgress('error', `运行失败: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const getStageColor = (stage: ProgressMessage['stage']) => {
    switch (stage) {
      case 'queued': return 'text-indigo-600';
      case 'detect': return 'text-blue-600';
      case 'search': return 'text-blue-600';
      case 'triage': return 'text-yellow-600';
      case 'process': return 'text-slate-600';
      case 'translate': return 'text-purple-600';
      case 'extract': return 'text-emerald-600';
      case 'evidence': return 'text-green-600';
      case 'complete': return 'text-green-700 font-medium';
      case 'error': return 'text-red-600';
      default: return 'text-slate-600';
    }
  };

  const getStageIcon = (stage: ProgressMessage['stage']) => {
    switch (stage) {
      case 'queued': return '\u23F3';
      case 'detect': return '\uD83D\uDD0D';
      case 'search': return '\uD83D\uDD0D';
      case 'triage': return '\uD83D\uDCCA';
      case 'process': return '\uD83D\uDD04';
      case 'translate': return '\uD83D\uDD04';
      case 'extract': return '\uD83D\uDCCE';
      case 'evidence': return '\uD83D\uDD12';
      case 'complete': return '\u2705';
      case 'error': return '\u26A0\uFE0F';
      default: return '.';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">运行监控</h2>
        <p className="mt-1 text-slate-500">后端执行法规采集与本体校验</p>
      </div>

      {!apiConfigured && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <WarningIcon className="h-5 w-5 text-red-600" />
            <div>
              <p className="font-medium text-red-800">OpenAI API Key 未配置</p>
              <p className="text-sm text-red-600">请在服务端配置 OPENAI_API_KEY</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <PlayIcon className="h-5 w-5 text-indigo-600" />
          触发新运行
        </h3>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">司法管辖区</label>
            <select
              value={selectedJurisdiction}
              onChange={(e) => setSelectedJurisdiction(e.target.value as Jurisdiction)}
              disabled={isRunning}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
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
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">时间窗口（天）</label>
            <select
              value={daysWindow}
              onChange={(e) => setDaysWindow(Number(e.target.value))}
              disabled={isRunning}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
            >
              <option value={30}>30 天</option>
              <option value={90}>90 天</option>
              <option value={180}>180 天</option>
              <option value={365}>365 天</option>
            </select>
          </div>

          <button
            onClick={handleTriggerRun}
            disabled={isRunning}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white transition-colors',
              isRunning ? 'cursor-not-allowed bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'
            )}
          >
            {isRunning ? (
              <>
                <LoadingIcon className="h-4 w-4 animate-spin" />
                采集中...
              </>
            ) : (
              <>
                <PlayIcon className="h-4 w-4" />
                开始采集
              </>
            )}
          </button>
        </div>

        {(isRunning || progress.length > 0) && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">实时进度</span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1">
              {progress.map((p, i) => (
                <div key={i} className={cn('flex items-start gap-2 text-sm', getStageColor(p.stage))}>
                  <span className="flex-shrink-0">{getStageIcon(p.stage)}</span>
                  <span className="flex-1">{p.message}</span>
                  <span className="flex-shrink-0 text-xs text-slate-400">
                    {p.timestamp.toLocaleTimeString('zh-CN')}
                  </span>
                </div>
              ))}
              {isRunning && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="animate-pulse">...</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <HistoryIcon className="h-5 w-5 text-slate-400" />
            运行历史
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {runs.map((run) => (
            <div key={run.id} className="p-6 hover:bg-slate-50">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={run.status} />
                    <span className="font-medium text-slate-900">{run.jurisdiction}</span>
                    <span className="text-sm text-slate-500">{run.days_window} 天窗口</span>
                  </div>
                  <div className="mt-2 font-mono text-xs text-slate-500">
                    {run.id}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    开始: {new Date(run.started_at).toLocaleString('zh-CN')}
                    {run.completed_at && (
                      <> · 完成: {new Date(run.completed_at).toLocaleString('zh-CN')}</>
                    )}
                  </div>
                  {run.meta && (
                    <div className="mt-2 text-xs text-slate-500">
                      {run.meta.discovered !== undefined && (
                        <span className="mr-3">发现: {String(run.meta.discovered)}</span>
                      )}
                      {run.meta.accepted !== undefined && (
                        <span className="mr-3">通过: {String(run.meta.accepted)}</span>
                      )}
                      {run.meta.review !== undefined && (
                        <span className="mr-3">审查: {String(run.meta.review)}</span>
                      )}
                      {run.meta.vector_count !== undefined && (
                        <span className="mr-3">向量: {String(run.meta.vector_count)}</span>
                      )}
                      {run.meta.merged !== undefined && (
                        <span className="mr-3">归并: {String(run.meta.merged)}</span>
                      )}
                      {run.meta.radar !== undefined && (
                        <span className="mr-3">雷达: {String(run.meta.radar)}</span>
                      )}
                      {run.meta.summary && (
                        <span className="block mt-1 text-slate-600">{String(run.meta.summary)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {runs.length === 0 && (
            <div className="p-12 text-center">
              <HistoryIcon className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">暂无运行记录</h3>
              <p className="mt-2 text-slate-500">触发首次运行以开始采集法规数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RunRecord['status'] }) {
  const config = {
    queued: { label: '排队中', color: 'bg-indigo-100 text-indigo-700' },
    running: { label: '运行中', color: 'bg-blue-100 text-blue-700' },
    completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
    failed: { label: '失败', color: 'bg-red-100 text-red-700' },
  };

  const { label, color } = config[status];

  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', color)}>
      {label}
    </span>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polygon points="5,3 19,12 5,21" fill="currentColor" />
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

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
