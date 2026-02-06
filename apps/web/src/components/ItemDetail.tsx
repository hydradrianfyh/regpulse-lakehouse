import { cn } from '../utils/cn';
import type { RegPulseItem } from '@regpulse/shared';
import { STATUS_CONFIG, PRIORITY_CONFIG, TOPIC_LABELS } from '@regpulse/shared';
import { EvidenceChain } from './EvidenceChain';

interface ItemDetailProps {
  item: RegPulseItem;
  onClose: () => void;
}

export function ItemDetail({ item, onClose }: ItemDetailProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30">
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className={cn(
              'inline-flex rounded px-2.5 py-1 text-sm font-semibold',
              item.priority === 'P0' ? 'bg-red-100 text-red-700' :
              item.priority === 'P1' ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            )}>
              {PRIORITY_CONFIG[item.priority].label}
            </span>
            <span className="rounded bg-slate-100 px-2 py-1 text-sm font-medium text-slate-600">
              {item.jurisdiction}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Title & Summary */}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-slate-600">{item.summary_1line}</p>
          </div>

          {/* Meta Grid */}
          <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4">
            <MetaItem label="来源机构" value={item.source_org} />
            <MetaItem label="文件类型" value={item.source_type.replace(/_/g, ' ')} />
            <MetaItem label="发布日期" value={item.published_date || '未知'} />
            <MetaItem label="生效日期" value={item.effective_date || '待定'} />
            <MetaItem label="状态" value={STATUS_CONFIG[item.status].label} />
            <MetaItem label="置信度" value={`${Math.round(item.confidence * 100)}%`} />
            <MetaItem label="抓取时间" value={new Date(item.retrieved_at).toLocaleString('zh-CN')} />
            <MetaItem label="Trust Tier" value={item.trust_tier || '-'} />
            <MetaItem label="Monitoring Stage" value={item.monitoring_stage || '-'} />
            <MetaItem label="条目 ID" value={item.id} mono />
          </div>

          {/* Topics */}
          <Section title="主题标签">
            <div className="flex flex-wrap gap-2">
              {item.topics.map((topic) => (
                <span
                  key={topic}
                  className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700"
                >
                  {TOPIC_LABELS[topic] || topic.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </Section>

          {/* Impact Areas */}
          <Section title="影响领域">
            <div className="flex flex-wrap gap-2">
              {item.impacted_areas.map((area) => (
                <span
                  key={area}
                  className="inline-flex rounded bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700"
                >
                  {area.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </Section>

          {/* Engineering Actions */}
          <Section title="工程动作（可执行）">
            <div className="space-y-3">
              {item.engineering_actions.map((action, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{action.action}</p>
                      <div className="mt-2 flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <UserIcon className="h-4 w-4" />
                          {action.owner_role}
                        </span>
                        {action.due_date && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-4 w-4" />
                            {action.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        <FileIcon className="h-3.5 w-3.5" />
                        {action.artifact}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Evidence Chain - Using EvidenceChain component */}
          <Section title="证据链追溯 (Detect → Triage → Translate → Evidence)">
            <EvidenceChain item={item} />
          </Section>

          {/* Notes */}
          {item.notes && (
            <Section title="备注">
              <p className="text-slate-600">{item.notes}</p>
            </Section>
          )}

          {/* Actions */}
          <div className="flex gap-3 border-t border-slate-200 pt-6">
            <button className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              添加到 Coverage Matrix
            </button>
            <button className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              导出详情
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn('mt-0.5 text-sm font-medium text-slate-900', mono && 'font-mono text-xs break-all')}>
        {value}
      </div>
    </div>
  );
}

// Icons
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}
