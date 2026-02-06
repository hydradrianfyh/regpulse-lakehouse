import { cn } from '../utils/cn';
import type { DashboardStats, RegPulseItem, Priority, ItemStatus } from '@regpulse/shared';
import { PRIORITY_CONFIG, STATUS_CONFIG } from '@regpulse/shared';

interface DashboardProps {
  stats: DashboardStats;
  items: RegPulseItem[];
  onItemClick: (item: RegPulseItem) => void;
  onClearData?: () => void;
}

export function Dashboard({ stats, items, onItemClick, onClearData }: DashboardProps) {
  const recentItems = items.slice(0, 5);
  const p0Items = items.filter(i => i.priority === 'P0');
  const lastMeta = (stats.last_run?.meta || {}) as Record<string, unknown>;
  const lastDiscovered = Number(lastMeta.discovered || 0);
  const lastVectorized = Number(lastMeta.vector_count || 0);
  const lastMerged = Number(lastMeta.merged || 0);
  const lastRadar = Number(lastMeta.radar || 0);
  const lastErrors = Array.isArray(lastMeta.errors) ? lastMeta.errors.length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">法规雷达仪表盘</h2>
          <p className="mt-1 text-slate-500">实时监控汽车行业法规动态 - 所有数据通过 OpenAI API 真实采集</p>
        </div>
        {items.length > 0 && onClearData && (
          <button
            onClick={onClearData}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            <TrashIcon className="h-4 w-4" />
            清除所有数据
          </button>
        )}
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <RadarIcon className="mx-auto h-16 w-16 text-slate-400" />
          <h3 className="mt-4 text-xl font-semibold text-slate-900">暂无法规数据</h3>
          <p className="mt-2 text-slate-600">请先配置 OpenAI API Key，然后运行采集任务获取真实法规数据</p>
          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-sm">
              <span className="text-sm text-slate-500">1. 前往</span>
              <span className="font-medium text-indigo-600">配置中心</span>
              <span className="text-sm text-slate-500">配置 API Key</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-sm">
              <span className="text-sm text-slate-500">2. 前往</span>
              <span className="font-medium text-indigo-600">运行监控</span>
              <span className="text-sm text-slate-500">执行真实采集</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="总条目数"
          value={stats.total_items}
          icon={<DocumentIcon />}
          color="indigo"
        />
        <StatCard
          title="P0 紧急"
          value={stats.items_by_priority.P0}
          icon={<AlertIcon />}
          color="red"
        />
        <StatCard
          title="待审核"
          value={stats.pending_review}
          icon={<ClockIcon />}
          color="yellow"
        />
        <StatCard
          title="隔离区"
          value={stats.quarantined}
          icon={<ShieldIcon />}
          color="gray"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Items */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ClockIcon className="h-5 w-5 text-slate-400" />
            最近抓取</h3>
          <div className="space-y-3">
            {recentItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onItemClick(item)}
                className="block w-full rounded-lg border border-slate-100 p-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.source_org}</p>
                  </div>
                  <PriorityBadge priority={item.priority} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ChartIcon className="h-5 w-5 text-slate-400" />
            优先级分布
          </h3>
          <div className="space-y-4">
            {(['P0', 'P1', 'P2'] as Priority[]).map((priority) => (
              <PriorityBar
                key={priority}
                priority={priority}
                count={stats.items_by_priority[priority]}
                total={stats.total_items}
              />
            ))}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <h4 className="mb-3 text-sm font-medium text-slate-700">状态分布</h4>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(stats.items_by_status) as [ItemStatus, number][])
                .filter(([_, count]) => count > 0)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center gap-2 text-sm">
                    <StatusDot status={status} />
                    <span className="text-slate-600">{STATUS_CONFIG[status].label}</span>
                    <span className="ml-auto font-medium text-slate-900">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* P0 Alerts */}
      {p0Items.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-red-800">
            <AlertIcon className="h-5 w-5" />
            P0 紧急法规变更</h3>
          <div className="space-y-3">
            {p0Items.map((item) => (
              <button
                key={item.id}
                onClick={() => onItemClick(item)}
                className="block w-full rounded-lg border border-red-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.summary_1line}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.topics.slice(0, 3).map((topic) => (
                        <span
                          key={topic}
                          className="inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                        >
                          {topic.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">生效日期</div>
                    <div className="text-sm font-medium text-red-700">
                      {item.effective_date || '待定'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Last Run Info */}
      {stats.last_run && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <PlayIcon className="h-5 w-5 text-slate-400" />
            最近运行
          </h3>
          <div className="grid grid-cols-6 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-slate-900">{lastDiscovered}</div>
              <div className="text-xs text-slate-500">Discovered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{lastVectorized}</div>
              <div className="text-xs text-slate-500">Vectorized</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{lastMerged}</div>
              <div className="text-xs text-slate-500">Merged</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-400">{lastRadar}</div>
              <div className="text-xs text-slate-500">Radar</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{lastErrors}</div>
              <div className="text-xs text-slate-500">Errors</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Run ID</div>
              <div className="font-mono text-xs text-slate-600">{stats.last_run.id.slice(0, 20)}...</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components
function StatCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  const colorClasses = {
    indigo: 'bg-indigo-50 text-indigo-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-4">
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-lg', colorClasses[color as keyof typeof colorClasses])}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          <div className="text-sm text-slate-500">{title}</div>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const colors = {
    P0: 'bg-red-100 text-red-700',
    P1: 'bg-orange-100 text-orange-700',
    P2: 'bg-blue-100 text-blue-700',
  };

  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', colors[priority])}>
      {priority}
    </span>
  );
}

function PriorityBar({ priority, count, total }: { priority: Priority; count: number; total: number }) {
  const config = PRIORITY_CONFIG[priority];
  const percentage = total > 0 ? (count / total) * 100 : 0;

  const barColors = {
    P0: 'bg-red-500',
    P1: 'bg-orange-500',
    P2: 'bg-blue-500',
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{config.label}</span>
        <span className="text-slate-500">{count}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full transition-all', barColors[priority])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ItemStatus }) {
  const colors = {
    proposed: 'bg-yellow-400',
    adopted: 'bg-blue-400',
    in_force: 'bg-green-400',
    repealed: 'bg-gray-400',
    unknown: 'bg-gray-300',
  };

  return <span className={cn('inline-block h-2 w-2 rounded-full', colors[status])} />;
}

// Icons
function DocumentIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

function AlertIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ClockIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function ShieldIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ChartIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function PlayIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="10,8 16,12 10,16" fill="currentColor" />
    </svg>
  );
}

function RadarIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

function TrashIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
