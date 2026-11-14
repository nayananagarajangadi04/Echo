"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Filter, Search, X } from "lucide-react";
import { api, todayLocal } from "@/lib/client";
import { GraphCanvas } from "@/components/GraphCanvas";
import { MemoryDrawer } from "@/components/MemoryDrawer";
import { CATEGORY_META, Chip, EmptyState } from "@/components/ui";
import { MEMORY_CATEGORIES, type GraphData, type MemoryCategory } from "@/lib/types";
import { dateLabel } from "@/lib/util";

type Range = "all" | "7d" | "today";

const RANGES: { key: Range; label: string; days?: number }[] = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days", days: 6 },
  { key: "today", label: "Today", days: 0 },
];

export default function BrainPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("7d");
  const [cats, setCats] = useState<MemoryCategory[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (cats.length) params.set("categories", cats.join(","));
      const chosen = RANGES.find((r) => r.key === range)!;
      if (chosen.days !== undefined) {
        const today = todayLocal();
        const d = new Date(`${today}T12:00:00`);
        d.setDate(d.getDate() - chosen.days);
        params.set("from", d.toLocaleDateString("en-CA"));
        params.set("to", today);
      }
      const res = await api<GraphData>(`/api/graph?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [q, cats, range]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggleCat = (c: MemoryCategory) =>
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const stats = data?.meta;

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col lg:h-screen">
      <div className="border-b border-line bg-ink-900/60 px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent" />
            <h1 className="text-lg font-bold tracking-tight">Brain Map</h1>
          </div>

          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search memories…"
              className="w-full rounded-xl border border-line bg-panel-2 py-1.5 pl-8 pr-8 text-sm text-fg placeholder:text-dim focus:border-accent/50 focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1.5 text-dim hover:text-fg"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex gap-1 rounded-xl border border-line bg-panel-2 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-lg px-2.5 py-1 text-xs ${
                  range === r.key ? "bg-panel-3 text-fg" : "text-dim hover:text-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-dim" />
            {MEMORY_CATEGORIES.map((c) => {
              const active = cats.includes(c);
              const meta = CATEGORY_META[c];
              return (
                <button
                  key={c}
                  onClick={() => toggleCat(c)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                    active ? `${meta.bg} ${meta.color}` : "border-line bg-panel-2 text-dim hover:text-muted"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: active ? meta.dot : "#3a4152" }}
                  />
                  {meta.label}
                </button>
              );
            })}
            {cats.length > 0 && (
              <button onClick={() => setCats([])} className="text-[11px] text-dim hover:text-fg">
                clear
              </button>
            )}
          </div>

          {stats && (
            <span className="ml-auto hidden text-[11px] text-dim xl:block">
              {stats.memoryCount} memories · {stats.hubCount} hubs · {stats.edgeCount} connections
            </span>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950/60">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
          </div>
        )}
        {error && (
          <div className="p-6">
            <EmptyState title="Could not load the brain map" body={error} />
          </div>
        )}
        {!loading && data && data.nodes.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No memories match these filters"
              body="Loosen the search, category or date filters — or capture something new on the Overview page."
            />
          </div>
        )}
        {!loading && data && data.nodes.length > 0 && (
          <>
            <GraphCanvas data={data} onSelectMemory={(id) => setOpenId(id)} />
            <div className="glass pointer-events-none absolute left-3 top-3 z-10 rounded-xl border border-line p-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-dim">
                Connections
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted">
                {(
                  [
                    ["related_to", "Related to"],
                    ["caused_by", "Caused by"],
                    ["followed_by", "Followed by"],
                    ["contradicts", "Contradicts"],
                    ["supports", "Supports"],
                    ["shared_topic", "Shared topic"],
                  ] as const
                ).map(([kind, label]) => (
                  <span key={kind} className="flex items-center gap-1.5">
                    <span
                      className="h-0.5 w-4 rounded-full"
                      style={{ background: { related_to: "#64748b", caused_by: "#fbbf24", followed_by: "#38bdf8", contradicts: "#fb7185", supports: "#34d399", shared_topic: "#8b5cf6" }[kind] }}
                    />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            {stats && stats.topicCounts.length > 0 && (
              <div className="glass absolute bottom-3 left-3 z-10 hidden max-w-[260px] rounded-xl border border-line p-3 lg:block">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-dim">
                  Recurring topics
                </div>
                <div className="flex flex-wrap gap-1">
                  {stats.topicCounts.slice(0, 8).map((t) => (
                    <Chip key={t.topic} color={CATEGORY_META.topic}>
                      {t.topic} ×{t.count}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <MemoryDrawer memoryId={openId} onClose={() => setOpenId(null)} onNavigate={(id) => setOpenId(id)} />
    </div>
  );
}
