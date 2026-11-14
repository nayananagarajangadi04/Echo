"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { api, shiftLocal, todayLocal } from "@/lib/client";
import { MemoryDrawer } from "@/components/MemoryDrawer";
import { Card, CATEGORY_META, Chip, EmptyState, ScoreRing } from "@/components/ui";
import { dateLongLabel } from "@/lib/util";
import type { DailySummary, Memory } from "@/lib/types";

interface TimelineData {
  date: string;
  memories: Memory[];
  summary: DailySummary | null;
}

export default function TimelinePage() {
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setDate(todayLocal());
  }, []);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<TimelineData>(`/api/timeline?date=${d}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date) load(date);
  }, [date, load]);

  if (!date) return <div className="p-6" />;

  const today = todayLocal();

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-bold tracking-tight">Daily timeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(shiftLocal(date, -1))}
            className="rounded-lg border border-line bg-panel-2 p-2 text-muted hover:text-fg"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm text-fg focus:outline-none"
          />
          <button
            onClick={() => setDate(shiftLocal(date, 1))}
            disabled={date >= today}
            className="rounded-lg border border-line bg-panel-2 p-2 text-muted hover:text-fg disabled:opacity-30"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-fg">{dateLongLabel(date)}</div>
            {date === today && <div className="text-[11px] text-accent-2">Today</div>}
          </div>
          {data?.summary && (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-[10px] uppercase tracking-wider text-dim">Learning score</div>
                <div className="text-sm font-semibold text-fg">{data.summary.learningScore}/100</div>
              </div>
              <ScoreRing score={data.summary.learningScore} size={64} />
            </div>
          )}
        </div>
        {data?.summary && (
          <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-muted">
            {data.summary.summary}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
        </div>
      ) : error ? (
        <EmptyState title="Could not load this day" body={error} />
      ) : !data || data.memories.length === 0 ? (
        <EmptyState
          title="No memories for this day"
          body="Nothing was captured on this date. Use the arrows to browse other days, or capture something new on the Overview."
        />
      ) : (
        <div className="relative space-y-3 border-l border-line pl-6">
          {data.memories.map((m, i) => {
            const meta = CATEGORY_META[m.category];
            return (
              <div key={m.id} className="relative">
                <span
                  className="absolute -left-[31px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-ink-950"
                  style={{ background: meta.dot }}
                />
                <button
                  onClick={() => setOpenId(m.id)}
                  className="w-full rounded-xl border border-line bg-panel p-4 text-left transition hover:border-line-2 hover:bg-panel-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-accent-2">{m.time}</span>
                    <Chip color={meta}>{m.category}</Chip>
                    {m.isDemo && <Chip className="border border-amber-400/30 text-amber-300">demo</Chip>}
                    {m.tone && <span className="text-[10px] text-dim">{m.tone}</span>}
                    {i === 0 && (
                      <span className="ml-auto text-[10px] text-dim">
                        {data.memories.length} events this day
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-fg">{m.title}</div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-dim">{m.summary}</p>
                  {(m.topics.length > 0 || m.people.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.people.map((p) => (
                        <Chip key={`p-${p}`} color={CATEGORY_META.person}>{p}</Chip>
                      ))}
                      {m.topics.slice(0, 4).map((t) => (
                        <Chip key={`t-${t}`} color={CATEGORY_META.topic}>{t}</Chip>
                      ))}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Card title="Browse">
        <div className="flex flex-wrap gap-2">
          {[6, 5, 4, 3, 2, 1, 0].map((delta) => {
            const d = shiftLocal(today, -delta);
            const hasData = d === date;
            return (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                  hasData
                    ? "border-accent/50 bg-accent/15 text-accent-2"
                    : "border-line bg-panel-2 text-muted hover:text-fg"
                }`}
              >
                {dateLongLabel(d).split(",")[1] || d}
              </button>
            );
          })}
        </div>
      </Card>

      <MemoryDrawer memoryId={openId} onClose={() => setOpenId(null)} onNavigate={(id) => setOpenId(id)} />
    </div>
  );
}
