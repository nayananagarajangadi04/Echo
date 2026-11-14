"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Lightbulb, Sparkles, TrendingUp, Zap } from "lucide-react";
import { api, post } from "@/lib/client";
import { MemoryChipLink, MemoryDrawer } from "@/components/MemoryDrawer";
import { Btn, Card, CATEGORY_META, Chip, EmptyState, Spinner } from "@/components/ui";
import { dateLabel } from "@/lib/util";
import type { ComputedInsight, PlanItem } from "@/lib/insights";
import type { ActionItem, Insight } from "@/lib/types";

interface InsightsData {
  computed: ComputedInsight[];
  reflections: Insight[];
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ plan: PlanItem[]; created: ActionItem[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<InsightsData>("/api/insights");
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (kind: "daily" | "weekly" | "plan") => {
    setGenerating(kind);
    setToast(null);
    try {
      if (kind === "plan") {
        const res = await post<{ plan: PlanItem[]; created: ActionItem[] }>("/api/insights/generate", {
          kind: "plan",
        });
        setPlan(res);
        setToast(`${res.created.length} suggestions created — approve them in the Action Center.`);
      } else {
        await post("/api/insights/generate", { kind });
        setToast(`${kind === "daily" ? "Daily" : "Weekly"} reflection saved.`);
        await load();
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-24">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <EmptyState title="Could not load insights" body={error} />
      </div>
    );
  }

  const reflections = data?.reflections || [];
  const computed = data?.computed || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-bold tracking-tight">Growth & insights</h1>
        </div>
        <div className="flex gap-2">
          <Btn onClick={() => generate("daily")} disabled={generating !== null}>
            {generating === "daily" ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            Daily reflection
          </Btn>
          <Btn onClick={() => generate("weekly")} disabled={generating !== null}>
            {generating === "weekly" ? <Spinner className="h-4 w-4" /> : <CalendarRange className="h-4 w-4" />}
            Weekly reflection
          </Btn>
          <Btn variant="primary" onClick={() => generate("plan")} disabled={generating !== null}>
            {generating === "plan" ? <Spinner className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            Build improvement plan
          </Btn>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          {toast}
        </div>
      )}

      {plan && plan.plan.length > 0 && (
        <Card title="Personalized improvement plan">
          <div className="space-y-3">
            {plan.plan.map((item, i) => (
              <div key={i} className="rounded-xl border border-line bg-panel-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Lightbulb className="h-4 w-4 text-amber-soft" />
                    {item.area}
                  </span>
                  <Chip color={CATEGORY_META.problem}>focus {i + 1}</Chip>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.reason}</p>
                <ul className="mt-2 space-y-1">
                  {item.actions.map((a, j) => (
                    <li key={j} className="flex gap-2 text-xs text-fg">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-2" />
                      {a}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-dim">Evidence:</span>
                  {item.evidenceIds.slice(0, 3).map((id) => (
                    <EvidenceChip key={id} id={id} onClick={(x) => setOpenId(x)} />
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-dim">
              {plan.created.length} action item{plan.created.length === 1 ? "" : "s"} were created as
              suggestions. Nothing changes in your plan until you approve it in the Action Center.
            </p>
          </div>
        </Card>
      )}

      <Card title="Signals from your memories">
        {computed.length === 0 ? (
          <EmptyState
            title="Not enough data yet"
            body="Capture a few days of memories and patterns will start appearing here — recurring problems, open commitments, learning momentum."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {computed.map((c) => (
              <div key={c.key} className="rounded-xl border border-line bg-panel-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-fg">{c.title}</span>
                  <Chip
                    color={
                      c.tone === "attention"
                        ? CATEGORY_META.problem
                        : c.tone === "positive"
                          ? CATEGORY_META.learning
                          : CATEGORY_META.topic
                    }
                  >
                    {c.metric}
                  </Chip>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted">{c.body}</p>
                {c.evidenceIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.evidenceIds.slice(0, 4).map((id) => (
                      <EvidenceChip key={id} id={id} onClick={(x) => setOpenId(x)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Saved reflections">
        {reflections.length === 0 ? (
          <p className="py-4 text-center text-sm text-dim">
            No reflections generated yet. Try &quot;Daily reflection&quot; above.
          </p>
        ) : (
          <div className="space-y-3">
            {reflections.map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-panel-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Sparkles className="h-4 w-4 text-accent" />
                    {r.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <Chip color={CATEGORY_META.goal}>{r.kind}</Chip>
                    <span className="text-[10px] text-dim">{dateLabel(r.date)}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{r.body}</p>
                {r.evidenceIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.evidenceIds.slice(0, 6).map((id) => (
                      <EvidenceChip key={id} id={id} onClick={(x) => setOpenId(x)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <MemoryDrawer memoryId={openId} onClose={() => setOpenId(null)} onNavigate={(id) => setOpenId(id)} />
    </div>
  );
}

function EvidenceChip({ id, onClick }: { id: string; onClick: (id: string) => void }) {
  const [title, setTitle] = useState<string>("memory");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    let alive = true;
    api<{ memory: { title: string; date: string } }>(`/api/memories/${id}`)
      .then((d) => {
        if (!alive) return;
        setTitle(d.memory.title);
        setDate(d.memory.date);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <MemoryChipLink id={id} title={title} date={date} onClick={onClick} icon={<Sparkles className="h-3 w-3" />} />
  );
}
