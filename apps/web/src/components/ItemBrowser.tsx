import { useState, useMemo, useEffect } from 'react';
import { cn } from '../utils/cn';
import type { RegPulseItem, Jurisdiction, SourceType, Priority } from '@regpulse/shared';
import { STATUS_CONFIG, TOPIC_LABELS } from '@regpulse/shared';
import { getReviewQueue } from '../lib/api-client';

interface ReviewQueueItem {
  id: string;
  entity_type: string;
  payload: Record<string, any>;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface ItemBrowserProps {
  items: RegPulseItem[];
  onItemClick: (item: RegPulseItem) => void;
  onRefresh: () => Promise<void> | void;
}

export function ItemBrowser({ items, onItemClick, onRefresh }: ItemBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    jurisdiction: '' as Jurisdiction | '',
    source_type: '' as SourceType | '',
    priority: '' as Priority | '',
    status: '' as string,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [showReview, setShowReview] = useState(true);
  const [reviewItems, setReviewItems] = useState<ReviewQueueItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);

  const loadReviewQueue = async () => {
    if (!showReview) return;
    setReviewLoading(true);
    try {
      const res = await getReviewQueue();
      setReviewItems(res.items as ReviewQueueItem[]);
    } catch {
      setReviewItems([]);
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    if (showReview) {
      loadReviewQueue();
    }
  }, [showReview]);

  const mappedReviewItems = useMemo(() => {
    if (!showReview) return [] as Array<RegPulseItem & { __review_status?: string; __review_reason?: string }>;
    return reviewItems
      .map((item) => toDisplayItem(item))
      .filter(Boolean) as Array<RegPulseItem & { __review_status?: string; __review_reason?: string }>;
  }, [reviewItems, showReview]);

  const displayItems = useMemo(() => {
    if (!showReview) return items;
    const map = new Map<string, RegPulseItem>();
    for (const item of items) {
      map.set(item.id, item);
    }
    for (const item of mappedReviewItems) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }, [items, mappedReviewItems, showReview]);

  const filteredItems = useMemo(() => {
    return displayItems.filter((item) => {
      // Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          item.title.toLowerCase().includes(query) ||
          item.summary_1line.toLowerCase().includes(query) ||
          item.source_org.toLowerCase().includes(query) ||
          item.topics.some(t => t.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Filters
      if (filters.jurisdiction && item.jurisdiction !== filters.jurisdiction) return false;
      if (filters.source_type && item.source_type !== filters.source_type) return false;
      if (filters.priority && item.priority !== filters.priority) return false;
      if (filters.status && item.status !== filters.status) return false;

      return true;
    });
  }, [displayItems, searchQuery, filters]);

  return (
    <div className="space-y-6">
      {/* Header */}
            <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">法规条目浏览</h2>
          <p className="mt-1 text-slate-500">
            共 {filteredItems.length} / {displayItems.length} 条记录{showReview ? '（含待审）' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await onRefresh();
                if (showReview) {
                  await loadReviewQueue();
                }
              } finally {
                setRefreshing(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '刷新中...' : '刷新'}
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <ExportIcon className="h-4 w-4" />
            导出 Parquet
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索标题、摘要、来源、主题..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showReview}
              onChange={(e) => setShowReview(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            显示待审条目
            {reviewLoading && <span className="text-xs text-slate-400">加载中...</span>}
          </label>

          {/* Jurisdiction Filter */}
          <select
            value={filters.jurisdiction}
            onChange={(e) => setFilters(f => ({ ...f, jurisdiction: e.target.value as Jurisdiction | '' }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">所有地区</option>
            <option value="EU">EU</option>
            <option value="UN_ECE">UN ECE</option>
            <option value="DE">德国</option>
            <option value="FR">法国</option>
            <option value="UK">英国</option>
            <option value="ES">西班牙</option>
            <option value="IT">意大利</option>
            <option value="CZ">捷克</option>
            <option value="PL">波兰</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filters.priority}
            onChange={(e) => setFilters(f => ({ ...f, priority: e.target.value as Priority | '' }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">所有优先级</option>
            <option value="P0">P0 - 紧急</option>
            <option value="P1">P1 - 高</option>
            <option value="P2">P2 - 中</option>
          </select>

          {/* Source Type Filter */}
          <select
            value={filters.source_type}
            onChange={(e) => setFilters(f => ({ ...f, source_type: e.target.value as SourceType | '' }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">所有类型</option>
            <option value="regulation">法规</option>
            <option value="draft">草案</option>
            <option value="guidance">指南</option>
            <option value="technical_notice">技术通告</option>
          </select>

          {/* Clear Filters */}
          {(searchQuery || Object.values(filters).some(Boolean)) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilters({ jurisdiction: '', source_type: '', priority: '', status: '' });
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {filteredItems.map((item) => (
          <ItemCard key={item.id} item={item} onClick={() => onItemClick(item)} />
        ))}

        {filteredItems.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <SearchIcon className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">未找到匹配的条目</h3>
            <p className="mt-2 text-slate-500">请尝试调整搜索条件或筛选器</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item, onClick }: { item: RegPulseItem; onClick: () => void }) {
  const priorityColors = {
    P0: 'border-l-red-500',
    P1: 'border-l-orange-500',
    P2: 'border-l-blue-500',
  };
  const reviewStatus = (item as any).__review_status as string | undefined;
  const reviewReason = (item as any).__review_reason as string | undefined;

  return (
    <button
      onClick={onClick}
      className={cn(
        'block w-full rounded-xl border border-slate-200 border-l-4 bg-white p-5 text-left transition-shadow hover:shadow-lg',
        priorityColors[item.priority]
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {item.jurisdiction}
            </span>
            <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {item.source_org}
            </span>
            <span className={cn(
              'inline-flex rounded px-2 py-0.5 text-xs font-medium',
              item.priority === 'P0' ? 'bg-red-100 text-red-700' :
              item.priority === 'P1' ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            )}>
              {item.priority}
            </span>
            <StatusBadge status={item.status} />
            {item.trust_tier && (
              <span className="inline-flex rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {item.trust_tier}
              </span>
            )}
            {item.monitoring_stage && (
              <span className="inline-flex rounded bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                {item.monitoring_stage}
              </span>
            )}
            {item.trust_tier === 'TIER_D_QUARANTINE' && (
              <span className="inline-flex rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                Quarantine
              </span>
            )}
            {item.trust_tier && item.trust_tier !== 'TIER_A_BINDING' && item.trust_tier !== 'TIER_D_QUARANTINE' && (
              <span className="inline-flex rounded bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                Review
              </span>
            )}
            {reviewStatus && (
              <span className={cn(
                'inline-flex rounded px-2 py-0.5 text-xs font-medium',
                reviewStatus === 'approved'
                  ? 'bg-green-50 text-green-700'
                  : reviewStatus === 'rejected'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-yellow-50 text-yellow-700'
              )}>
                Review Queue · {reviewStatus}
              </span>
            )}
          </div>

          {/* Title & Summary */}
          <h3 className="mt-2 font-semibold text-slate-900">{item.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{item.summary_1line}</p>
          {reviewReason && (
            <p className="mt-1 text-xs text-amber-700">原因: {reviewReason}</p>
          )}

          {/* Topics */}
          <div className="mt-3 flex flex-wrap gap-2">
            {item.topics.map((topic) => (
              <span
                key={topic}
                className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
              >
                {TOPIC_LABELS[topic] || topic.replace(/_/g, ' ')}
              </span>
            ))}
          </div>

          {/* Impact Areas */}
          <div className="mt-2 flex flex-wrap gap-2">
            {item.impacted_areas.slice(0, 4).map((area) => (
              <span
                key={area}
                className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              >
                {area.replace(/_/g, ' ')}
              </span>
            ))}
            {item.impacted_areas.length > 4 && (
              <span className="text-xs text-gray-400">+{item.impacted_areas.length - 4}</span>
            )}
          </div>
        </div>

        {/* Right Side */}
        <div className="flex-shrink-0 text-right">
          <div className="text-xs text-slate-500">发布日期</div>
          <div className="text-sm font-medium text-slate-700">{item.published_date || '-'}</div>
          
          {item.effective_date && (
            <>
              <div className="mt-2 text-xs text-slate-500">生效日期</div>
              <div className="text-sm font-medium text-green-700">{item.effective_date}</div>
            </>
          )}

          <div className="mt-3">
            <ConfidenceBadge confidence={item.confidence} />
          </div>
        </div>
      </div>

      {/* Evidence indicator */}
      <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <LinkIcon className="h-3.5 w-3.5" />
          原始链接
        </span>
        {item.evidence.raw_file_uri && (
          <span className="flex items-center gap-1">
            <FileIcon className="h-3.5 w-3.5" />
            原文存档
          </span>
        )}
        <span className="flex items-center gap-1">
          <CheckIcon className="h-3.5 w-3.5 text-green-500" />
          证据链完整
        </span>
        <span className="ml-auto font-mono text-slate-400">
          {item.id.slice(0, 16)}...
        </span>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || { label: status, color: 'gray' };
  const colorClasses = {
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={cn('inline-flex rounded px-2 py-0.5 text-xs font-medium', colorClasses[config.color as keyof typeof colorClasses])}>
      {config.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color = percent >= 90 ? 'text-green-600' : percent >= 70 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className={cn('text-sm font-medium', color)}>
      {percent}% 置信度
    </div>
  );
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ExportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9" />
      <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 9 9" />
      <polyline points="6,4 3,4 3,7" />
      <polyline points="18,20 21,20 21,17" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function toDisplayItem(item: ReviewQueueItem): (RegPulseItem & { __review_status?: string; __review_reason?: string }) | null {
  if (item.entity_type !== 'RegulationItem') return null;
  const payload = item.payload || {};

  const normalizePriority = (value: any): Priority => {
    if (value === 'P0' || value === 'P1' || value === 'P2') return value;
    const normalized = typeof value === 'string' ? value.toLowerCase() : '';
    if (normalized.includes('high') || normalized.includes('p1')) return 'P1';
    if (normalized.includes('urgent') || normalized.includes('critical') || normalized.includes('p0')) return 'P0';
    if (normalized.includes('low') || normalized.includes('medium') || normalized.includes('p2')) return 'P2';
    return 'P2';
  };

  const normalizeStatus = (value: any): RegPulseItem['status'] => {
    const key = String(value || '').toLowerCase();
    if (STATUS_CONFIG[key as keyof typeof STATUS_CONFIG]) return key as RegPulseItem['status'];
    return 'unknown';
  };

  const normalizeSourceType = (value: any): SourceType => {
    if (value === 'regulation' || value === 'draft' || value === 'guidance' || value === 'technical_notice') {
      return value;
    }
    return 'guidance';
  };

  const evidence = (payload.evidence && typeof payload.evidence === 'object')
    ? payload.evidence
    : { raw_file_uri: null, text_snapshot_uri: null, citations: [] };

  const fallbackUrl = evidence?.citations?.[0]?.url || '';
  const title = payload.title || payload.summary_1line || 'Untitled';

  return {
    id: payload.id || `review:${item.id}`,
    jurisdiction: payload.jurisdiction || 'EU',
    source_org: payload.source_org || 'Unknown',
    source_type: normalizeSourceType(payload.source_type),
    title,
    summary_1line: String(payload.summary_1line || title).slice(0, 400),
    url: payload.url || fallbackUrl,
    published_date: payload.published_date ?? null,
    retrieved_at: payload.retrieved_at || item.created_at,
    effective_date: payload.effective_date ?? null,
    status: normalizeStatus(payload.status),
    topics: Array.isArray(payload.topics) ? payload.topics.filter((t: any) => typeof t === 'string') : [],
    impacted_areas: Array.isArray(payload.impacted_areas) ? payload.impacted_areas.filter((t: any) => typeof t === 'string') : [],
    engineering_actions: Array.isArray(payload.engineering_actions) ? payload.engineering_actions : [],
    evidence,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.7,
    notes: payload.notes || '',
    priority: normalizePriority(payload.priority),
    source_document_id: payload.source_document_id,
    trust_tier: payload.trust_tier,
    monitoring_stage: payload.monitoring_stage,
    source_profile_id: payload.source_profile_id,
    __review_status: item.status,
    __review_reason: item.reason
  } as RegPulseItem & { __review_status?: string; __review_reason?: string };
}
