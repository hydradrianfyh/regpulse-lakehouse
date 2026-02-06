import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';
import type { RegPulseConfig } from '@regpulse/shared';
import { ALLOWED_DOMAINS } from '@regpulse/shared';
import { updateConfig } from '../lib/api-client';

interface ConfigPanelProps {
  config: RegPulseConfig;
  onRefresh: () => void;
}

export function ConfigPanel({ config, onRefresh }: ConfigPanelProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    openai_api_key: '',
    openai_model: config.openai_model,
    reasoning_effort: config.reasoning_effort,
    confidence_min: config.confidence_min
  });

  useEffect(() => {
    setForm({
      openai_api_key: '',
      openai_model: config.openai_model,
      reasoning_effort: config.reasoning_effort,
      confidence_min: config.confidence_min
    });
  }, [config.openai_model, config.reasoning_effort, config.confidence_min]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: {
        openai_api_key?: string;
        openai_model?: string;
        reasoning_effort?: 'low' | 'medium' | 'high';
        confidence_min?: number;
      } = {
        openai_model: form.openai_model,
        reasoning_effort: form.reasoning_effort as 'low' | 'medium' | 'high',
        confidence_min: Number(form.confidence_min)
      };
      if (form.openai_api_key.trim()) {
        payload.openai_api_key = form.openai_api_key.trim();
      }

      await updateConfig(payload);
      await onRefresh();
      setForm((prev) => ({ ...prev, openai_api_key: '' }));
      setMessage('已保存到后端配置（本地数据库），worker 会自动读取');
    } catch (error: any) {
      setMessage(error?.message || '保存失败，请检查配置');
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateConfig({ openai_api_key: '' });
      await onRefresh();
      setMessage('已清空 API Key（后端与 worker 同步）');
    } catch (error: any) {
      setMessage(error?.message || '清空失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">配置中心</h2>
        <p className="mt-1 text-slate-500">本体化后端接管 OpenAI 与治理策略（支持 UI 运行时配置）</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <KeyIcon className="h-5 w-5 text-slate-400" />
          OpenAI API 状态
        </h3>

        <div className={cn(
          'flex items-center gap-2 rounded-lg px-4 py-2',
          config.openai_api_key_configured
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        )}>
          {config.openai_api_key_configured ? (
            <>
              <CheckCircleIcon className="h-5 w-5" />
              <span className="font-medium">API Key 已配置</span>
            </>
          ) : (
            <>
              <XCircleIcon className="h-5 w-5" />
              <span className="font-medium">API Key 未配置</span>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">OpenAI API Key</label>
            <input
              type="password"
              value={form.openai_api_key}
              onChange={(e) => setForm(prev => ({ ...prev, openai_api_key: e.target.value }))}
              placeholder="留空表示不修改"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">保存到本机数据库，worker 可直接使用</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">模型</label>
            <input
              type="text"
              value={form.openai_model}
              onChange={(e) => setForm(prev => ({ ...prev, openai_model: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">推理强度</label>
            <select
              value={form.reasoning_effort}
              onChange={(e) => setForm(prev => ({ ...prev, reasoning_effort: e.target.value as 'low' | 'medium' | 'high' }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">置信度阈值</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={form.confidence_min}
              onChange={(e) => setForm(prev => ({ ...prev, confidence_min: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium text-white',
              saving ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            )}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button
            onClick={handleClearKey}
            disabled={saving}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium',
              saving ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100'
            )}
          >
            清空 API Key
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium text-white',
              refreshing ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-800'
            )}
          >
            {refreshing ? '刷新中...' : '刷新状态'}
          </button>
        </div>

        {message && (
          <div className="mt-3 text-sm text-slate-600">{message}</div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ShieldIcon className="h-5 w-5 text-slate-400" />
          允许域名（本体治理）
        </h3>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="flex flex-wrap gap-2">
            {ALLOWED_DOMAINS.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                {domain}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons
function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="9,12 11,14 15,10" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
