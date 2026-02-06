import { useEffect, useMemo, useRef, useState } from "react";
import { getLineage } from "../lib/api-client";
import { cn } from "../utils/cn";

interface LineageNode {
  id: string;
  label: string;
  type: string;
  meta?: Record<string, unknown>;
}

interface LineageEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

const columnOrder = ["Run", "SourceDocument", "RegulationItem", "Requirement", "Evidence"];

export function LineageGraph() {
  const [nodes, setNodes] = useState<LineageNode[]>([]);
  const [edges, setEdges] = useState<LineageEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLineage();
        setNodes(res.nodes || []);
        setEdges(res.edges || []);
      } catch (err: any) {
        setError(err.message || "加载血缘关系失败");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const layout = useMemo(() => {
    const byType: Record<string, LineageNode[]> = {};
    for (const node of nodes) {
      if (!byType[node.type]) byType[node.type] = [];
      byType[node.type].push(node);
    }

    const positions = new Map<string, { x: number; y: number }>();
    const columnWidth = 260;
    const rowHeight = 110;
    const xOffset = 40;
    const yOffset = 60;

    columnOrder.forEach((type, colIndex) => {
      const list = byType[type] || [];
      list.forEach((node, rowIndex) => {
        positions.set(node.id, {
          x: xOffset + colIndex * columnWidth,
          y: yOffset + rowIndex * rowHeight
        });
      });
    });

    const maxRows = Math.max(1, ...columnOrder.map(type => (byType[type] || []).length));
    const height = yOffset + maxRows * rowHeight + 80;
    const width = xOffset + columnOrder.length * columnWidth;

    return { positions, width, height };
  }, [nodes]);

  const zoomIn = () => setScale((s) => Math.min(2.5, Number((s + 0.1).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.4, Number((s - 0.1).toFixed(2))));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">血缘图谱（Foundry 风格）</h2>
        <p className="mt-1 text-slate-500">从数据源到条目、要求与证据的可视化血缘关系</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {loading ? (
          <div className="text-sm text-slate-500">加载中...</div>
        ) : nodes.length === 0 ? (
          <div className="text-sm text-slate-500">暂无血缘数据</div>
        ) : (
          <div className="relative overflow-hidden">
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow">
              <button onClick={zoomOut} className="rounded px-2 py-1 hover:bg-slate-100">-</button>
              <span>{Math.round(scale * 100)}%</span>
              <button onClick={zoomIn} className="rounded px-2 py-1 hover:bg-slate-100">+</button>
              <button onClick={resetView} className="rounded px-2 py-1 hover:bg-slate-100">Reset</button>
            </div>

            <div
              className={cn("relative cursor-grab", dragging && "cursor-grabbing")}
              onMouseDown={(e) => {
                setDragging(true);
                dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
              }}
              onMouseMove={(e) => {
                if (!dragging || !dragRef.current) return;
                setOffset({
                  x: e.clientX - dragRef.current.x,
                  y: e.clientY - dragRef.current.y
                });
              }}
              onMouseUp={() => {
                setDragging(false);
                dragRef.current = null;
              }}
              onMouseLeave={() => {
                setDragging(false);
                dragRef.current = null;
              }}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                setScale((s) => {
                  const next = Math.min(2.5, Math.max(0.4, Number((s + delta).toFixed(2))));
                  return next;
                });
              }}
              style={{
                width: layout.width,
                height: layout.height,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: "0 0"
              }}
            >
              <svg
                className="absolute inset-0"
                width={layout.width}
                height={layout.height}
              >
                {edges.map((edge) => {
                  const source = layout.positions.get(edge.source);
                  const target = layout.positions.get(edge.target);
                  if (!source || !target) return null;
                  const x1 = source.x + 180;
                  const y1 = source.y + 28;
                  const x2 = target.x;
                  const y2 = target.y + 28;
                  return (
                    <g key={edge.id}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#CBD5F5"
                        strokeWidth={2}
                      />
                      <circle cx={x2} cy={y2} r={3} fill="#6366F1" />
                    </g>
                  );
                })}
              </svg>

              {nodes.map((node) => {
                const pos = layout.positions.get(node.id);
                if (!pos) return null;
                return (
                  <div
                    key={node.id}
                    className={cn(
                      "absolute w-44 rounded-lg border px-3 py-2 shadow-sm",
                      nodeColor(node.type)
                    )}
                    style={{ left: pos.x, top: pos.y }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {node.type}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900 line-clamp-2">
                      {node.label}
                    </div>
                    {renderMeta(node)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2 text-xs">
          {columnOrder.map((type) => (
            <span key={type} className={cn("rounded-full px-2 py-0.5 font-medium", nodeColor(type))}>
              {type}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function nodeColor(type: string) {
  switch (type) {
    case "Run":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    case "SourceDocument":
      return "border-slate-200 bg-slate-50 text-slate-800";
    case "RegulationItem":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "Requirement":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "Evidence":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-slate-200 bg-white text-slate-800";
  }
}

function renderMeta(node: LineageNode) {
  if (!node.meta) return null;
  const meta = node.meta as Record<string, any>;
  const parts: string[] = [];
  if (meta.priority) parts.push(String(meta.priority));
  if (meta.trust_tier) parts.push(String(meta.trust_tier));
  if (meta.status) parts.push(String(meta.status));
  if (meta.review_status) parts.push(`review:${meta.review_status}`);
  if (meta.jurisdiction) parts.push(String(meta.jurisdiction));
  if (meta.domain) parts.push(String(meta.domain));

  if (parts.length === 0) return null;
  return (
    <div className="mt-1 text-[11px] text-slate-500 line-clamp-2">
      {parts.join(" · ")}
    </div>
  );
}
