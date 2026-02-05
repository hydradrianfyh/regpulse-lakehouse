import { useState } from 'react';
import { cn } from '../utils/cn';
import type { Jurisdiction } from '@regpulse/shared';
import { ALLOWED_DOMAINS } from '@regpulse/shared';
import { triggerScan } from '../lib/api-client';

interface ScanPanelProps {
  apiConfigured: boolean;
  onAfterScan: () => void;
}

interface ScanProgress {
  stage: 'idle' | 'running' | 'complete' | 'error';
  message: string;
}

export function ScanPanel({ apiConfigured, onAfterScan }: ScanPanelProps) {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('EU');
  const [daysWindow, setDaysWindow] = useState(90);
  const [searchQuery, setSearchQuery] = useState('ADAS,Battery,Emission,AI ACT,GDPR,Data Privacy,Cybersecurity,Automated Driving,WVTA,type approval,UNECE WP.29');
  const [maxResults, setMaxResults] = useState(5);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress>({ stage: 'idle', message: '' });
  const [jobId, setJobId] = useState<string | null>(null);

  const handleScan = async () => {
    if (!apiConfigured) {
      setProgress({ stage: 'error', message: '后端未配置 OpenAI API Key' });
      return;
    }

    setIsScanning(true);
    setProgress({ stage: 'running', message: '正在执行后端扫描与本体校验...' });
    setJobId(null);

    try {
      const result = await triggerScan({
        jurisdiction,
        days: daysWindow,
        query: searchQuery,
        max_results: maxResults
      });

      setJobId(result.job_id || null);
      setProgress({ stage: 'complete', message: `任务已提交，Job: ${result.job_id || 'pending'}。请在运行监控中查看进度。` });
      onAfterScan();
    } catch (error: any) {
      setProgress({ stage: 'error', message: error.message || '扫描失败' });
    } finally {
      setIsScanning(false);
    }
  };

  const getStageColor = (stage: ScanProgress['stage']) => {
    switch (stage) {
      case 'running': return 'text-blue-600';
      case 'complete': return 'text-green-700';
      case 'error': return 'text-red-600';
      default: return 'text-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">法规扫描与本体校验</h2>
        <p className="mt-1 text-slate-500">
          扫描由后端执行，所有输出通过 Ontology 校验，不合规进入 Review Queue
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <SearchIcon className="h-5 w-5 text-slate-400" />
          扫描配置
        </h3>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">司法管辖区</label>
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)}
                disabled={isScanning}
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
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">时间范围（天）</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={7}
                  max={365}
                  value={daysWindow}
                  onChange={(e) => setDaysWindow(Number(e.target.value))}
                  disabled={isScanning}
                  className="flex-1"
                />
                <span className="w-16 rounded bg-slate-100 px-2 py-1 text-center text-sm font-medium">
                  {daysWindow}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">最大结果数</label>
              <input
                type="number"
                min={1}
                max={20}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                disabled={isScanning}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">搜索查询</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isScanning}
                placeholder="例如: ADAS,Battery,Emission,AI ACT,GDPR,Data Privacy,Cybersecurity,Automated Driving,WVTA,type approval,UNECE WP.29"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">允许的域名</label>
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 max-h-24 overflow-y-auto">
                {ALLOWED_DOMAINS.map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700"
                  >
                    {domain}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleScan}
            disabled={isScanning || !searchQuery.trim()}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white',
              isScanning ? 'cursor-not-allowed bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'
            )}
          >
            {isScanning ? (
              <>
                <LoadingIcon className="h-4 w-4 animate-spin" />
                扫描中...
              </>
            ) : (
              <>
                <ScanIcon className="h-4 w-4" />
                开始扫描
              </>
            )}
          </button>

          {progress.stage !== 'idle' && (
            <div className={cn('flex items-center gap-2 text-sm', getStageColor(progress.stage))}>
              {progress.stage === 'running' && <LoadingIcon className="h-4 w-4 animate-spin" />}
              <span>{progress.message}</span>
            </div>
          )}
        </div>
      </div>

      {jobId && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-2 text-lg font-semibold text-slate-900">任务已入队</h3>
          <p className="text-sm text-slate-600">Job ID: {jobId}</p>
          <p className="mt-2 text-sm text-slate-500">运行监控中可查看进度与结果。</p>
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-900">
          <InfoIcon className="h-5 w-5" />
          本体治理说明
        </h3>
        <div className="text-sm text-blue-800">
          所有扫描结果将经过 Ontology 校验，不合规字段与低置信度输出会进入 Review Queue，避免进入主数据。
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ScanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <line x1="12" y1="2" x2="12" y2="12" />
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

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
