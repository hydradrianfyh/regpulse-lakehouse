import { useEffect, useState } from 'react';
import { getReviewQueue, approveReview, rejectReview } from '../lib/api-client';

interface ReviewItem {
  id: string;
  entity_type: string;
  payload: Record<string, any>;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface ReviewQueueProps {
  onAfterDecision?: () => void;
  onNavigateToBrowser?: () => void;
}

export function ReviewQueue({ onAfterDecision, onNavigateToBrowser }: ReviewQueueProps) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReviewQueue();
      setItems(res.items as ReviewItem[]);
    } catch (err: any) {
      setError(err?.message || '加载失败，请检查后端服务');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      await approveReview(id);
      await load();
      onAfterDecision?.();
      onNavigateToBrowser?.();
    } catch (err: any) {
      setError(err?.message || '审批失败');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      await rejectReview(id);
      await load();
      onAfterDecision?.();
    } catch (err: any) {
      setError(err?.message || '拒绝失败');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Review Queue</h2>
        <p className="mt-1 text-slate-500">本体校验未通过的条目在此审查</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">待审查条目</h3>
          <button
            onClick={load}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>

        {error && (
          <div className="border-b border-slate-200 px-6 py-3 text-sm text-red-600 bg-red-50">
            {error}
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.id} className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm text-slate-500">{item.entity_type}</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {item.payload?.title || 'Untitled'}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">原因: {item.reason}</div>
                  <div className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('zh-CN')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    item.status === 'approved' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {item.status}
                  </span>
                  {item.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(item.id)}
                        disabled={actionId === item.id}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        {actionId === item.id ? '处理中...' : '通过'}
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        disabled={actionId === item.id}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {actionId === item.id ? '处理中...' : '拒绝'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="p-12 text-center text-slate-500">暂无待审查条目</div>
          )}
        </div>
      </div>
    </div>
  );
}
