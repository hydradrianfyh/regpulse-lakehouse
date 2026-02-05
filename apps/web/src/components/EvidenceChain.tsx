import { useState } from 'react';
import { cn } from '../utils/cn';
import type { RegPulseItem } from '@regpulse/shared';
import { verifyEvidence } from '../lib/api-client';

interface EvidenceChainProps {
  item: RegPulseItem;
}

export function EvidenceChain({ item }: EvidenceChainProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const handleVerifyEvidence = async () => {
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const result = await verifyEvidence({ item });
      setVerificationResult(result);
    } catch (error: any) {
      setVerificationResult({
        success: false,
        message: `验证失败: ${error.message}`
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const stages = [
    {
      id: 'detect',
      title: 'Detect (发现)',
      description: '通过后端扫描管道采集允许域名',
      status: 'completed' as const,
      details: [
        { label: '原始 URL', value: item.url, type: 'link' as const },
        { label: '来源机构', value: item.source_org, type: 'text' as const },
        { label: '抓取时间', value: new Date(item.retrieved_at).toLocaleString('zh-CN'), type: 'text' as const },
      ],
    },
    {
      id: 'triage',
      title: 'Triage (分诊)',
      description: '使用 Ontology 进行类型与优先级约束',
      status: 'completed' as const,
      details: [
        { label: '文件类型', value: item.source_type.replace(/_/g, ' '), type: 'text' as const },
        { label: '优先级', value: item.priority, type: 'badge' as const },
        { label: '状态', value: item.status, type: 'text' as const },
        { label: '条目 ID (hash)', value: item.id, type: 'mono' as const },
      ],
    },
    {
      id: 'translate',
      title: 'Translate (工程化翻译)',
      description: '转化为可执行工程动作与 Coverage Matrix',
      status: 'completed' as const,
      details: [
        { label: '影响领域', value: item.impacted_areas.join(', '), type: 'text' as const },
        { label: '工程动作数', value: `${item.engineering_actions.length} 项`, type: 'text' as const },
        { label: '主题标签', value: item.topics.join(', '), type: 'text' as const },
      ],
    },
    {
      id: 'evidence',
      title: 'Evidence (证据落盘)',
      description: '原文存档 + 结构化 JSON + 引用',
      status: item.evidence.raw_file_uri ? 'completed' as const : 'pending' as const,
      details: [
        { label: '原始文件', value: item.evidence.raw_file_uri || '待下载', type: 'mono' as const },
        { label: '文本快照', value: item.evidence.text_snapshot_uri || '待解析', type: 'mono' as const },
        { label: '引用来源', value: `${item.evidence.citations.length} 条`, type: 'text' as const },
        { label: '置信度', value: `${Math.round(item.confidence * 100)}%`, type: 'text' as const },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {stages.map((stage, index) => (
        <div key={stage.id} className="relative">
          {index < stages.length - 1 && (
            <div className="absolute left-5 top-12 h-full w-0.5 bg-slate-200" />
          )}

          <div className={cn(
            'rounded-lg border p-4',
            stage.status === 'completed' 
              ? 'border-green-200 bg-green-50' 
              : 'border-yellow-200 bg-yellow-50'
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
                stage.status === 'completed'
                  ? 'bg-green-500 text-white'
                  : 'bg-yellow-400 text-yellow-900'
              )}>
                {stage.status === 'completed' ? (
                  <CheckIcon className="h-5 w-5" />
                ) : (
                  <ClockIcon className="h-5 w-5" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900">{stage.title}</h4>
                  <span className={cn(
                    'text-xs font-medium',
                    stage.status === 'completed' ? 'text-green-700' : 'text-yellow-700'
                  )}>
                    {stage.status === 'completed' ? '已完成' : '进行中'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{stage.description}</p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {stage.details.map((detail, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-slate-500">{detail.label}: </span>
                      {detail.type === 'link' ? (
                        <a
                          href={detail.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline break-all"
                        >
                          {detail.value.length > 50 ? detail.value.slice(0, 50) + '...' : detail.value}
                        </a>
                      ) : detail.type === 'mono' ? (
                        <span className="font-mono text-xs text-slate-700 break-all">{detail.value}</span>
                      ) : detail.type === 'badge' ? (
                        <span className={cn(
                          'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
                          detail.value === 'P0' ? 'bg-red-100 text-red-700' :
                          detail.value === 'P1' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        )}>
                          {detail.value}
                        </span>
                      ) : (
                        <span className="font-medium text-slate-700">{detail.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {item.evidence.citations.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">引用来源 (Citations)</h4>
          <div className="space-y-2">
            {item.evidence.citations.map((citation, i) => (
              <div key={i} className="rounded bg-slate-50 p-3">
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  {citation.title || citation.url}
                </a>
                {citation.snippet && (
                  <p className="mt-1 text-sm text-slate-600">{citation.snippet}</p>
                )}
                <p className="mt-1 text-xs text-slate-400 truncate">{citation.url}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500 text-white">
              <AIIcon className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-purple-900">AI 证据验证</h4>
              <p className="text-sm text-purple-700">
                由后端调用模型验证证据链一致性
              </p>
            </div>
          </div>
          <button
            onClick={handleVerifyEvidence}
            disabled={isVerifying}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium text-white',
              isVerifying
                ? 'bg-purple-400 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700'
            )}
          >
            {isVerifying ? (
              <span className="flex items-center gap-2">
                <LoadingIcon className="h-4 w-4 animate-spin" />
                验证中...
              </span>
            ) : (
              '运行 AI 验证'
            )}
          </button>
        </div>

        {verificationResult && (
          <div className={cn(
            'mt-4 rounded-lg p-4',
            verificationResult.success ? 'bg-green-100' : 'bg-red-100'
          )}>
            <div className="flex items-center gap-2">
              {verificationResult.success ? (
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
              ) : (
                <XCircleIcon className="h-5 w-5 text-red-600" />
              )}
              <span className={cn(
                'font-medium',
                verificationResult.success ? 'text-green-800' : 'text-red-800'
              )}>
                {verificationResult.message}
              </span>
            </div>
            {verificationResult.details && (
              <div className="mt-3 rounded bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                {verificationResult.details}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white">
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-semibold text-indigo-900">证据链可审计</h4>
            <p className="text-sm text-indigo-700">
              证据链追溯信息由关系驱动生成，支持审计与治理
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9,12 11,14 15,10" />
    </svg>
  );
}

function AIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
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
