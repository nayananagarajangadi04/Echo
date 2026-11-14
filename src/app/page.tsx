"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Flame,
  ListChecks,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { apiSend, useEcho } from "@/lib/echo-context";
import { CapturePanel } from "@/components/CapturePanel";
import { MemoryDrawer } from "@/components/MemoryDrawer";
import { Card, CATEGORY_META, Chip, EmptyState, ScoreRing, StatCard } from "@/components/ui";
import { formatDuration } from "@/lib/util";

function greetingFor(name: string | null): string {
  const h = new Date().getHours();
  const part = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

function BrainPreview({
  memories,
}: {
  memories: { id: string; title: string; category: string }[];
}) {
  const shown = memories.slice(0, 10);
  const cols = 5;
  return (
    <div className="relative">
      <svg viewBox="0 0 300 130" className="w-full">
        {shown.slice(1).map((m, i) => (
          <line
            key={`l${m.id}`}
            x1={30 + ((i + 1) % cols) * 60}
            y1={35 + Math.floor((i + 1) / cols) * 60}
            x2={30 + (i % cols) * 60}
            y2={35 + Math.floor(i / cols) * 60}
            stroke="#1d2230"
            strokeWidth="1"
          />
        ))}
        {shown.map((m, i) => {
          const meta = CATEGORY_META[m.category as keyof typeof CATEGORY_META] || CATEGORY_META.memory;
          return (
            <g key={m.id}>
              <circle
                cx={30 + (i % cols) * 60}
                cy={35 + Math.floor(i / cols) * 60}
                r="9"
                fill={meta.dot}
                opacity="0.9"
              />
              <circle cx={30 + (i % cols) * 60} cy={35 + Math.floor(i / cols) * 60} r="14" fill={meta.dot} opacity="0.15" />
            </g>
          );
        })}
      </svg>
      {shown.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {shown.slice(0, 5).map((m) => {
            const meta = CATEGORY_META[m.category as keyof typeof CATEGORY_META] || CATEGORY_META.memory;
            return (
              <span key={m.id} className="inline-flex items-center gap-1 text-[10px] text-dim">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                <span className="max-w-[110px] truncate">{m.title}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const echo = useEcho();
  const { stats, score, topics, goals, computed, todayMemories, summary, profile, demoMode } = echo;
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const name = profile.displayName || profile.fullName || null;

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    const clean = newGoalTitle.trim();
    if (clean.length < 2 || savingGoal) return;
    setSavingGoal(true);
    try {
      await apiSend("/api/goals", "POST", { title: clean });
      setNewGoalTitle("");
      await echo.refresh();
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleToggleGoal(id: string, currentStatus: "active" | "done" | "dropped") {
    const next = currentStatus === "done" ? "active" : "done";
    await apiSend(`/api/goals/${id}`, "PATCH", { status: next });
    await echo.refresh();
  }

  async function handleDeleteGoal(id: string) {
    await apiSend(`/api/goals/${id}`, "DELETE");
    await echo.refresh();
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-grad">{greetingFor(name)}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              {demoMode
                ? "Exploring with demo data — everything you capture is kept separately."
                : `Your second brain has ${stats.totalMemories} memories across ${stats.daysCovered} days.`}
            </p>
          </div>
          {demoMode && (
            <Chip className="border border-amber-400/30 bg-amber-400/10 text-amber-300">
              Demo data on · <Link href="/settings" className="underline">manage</Link>
            </Chip>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Link
          href="/companion"
          className="group flex items-center gap-4 rounded-2xl border border-accent/30 bg-panel p-4 transition hover:border-accent/60 hover:bg-panel-2 sm:p-5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl grad-accent shadow-lg shadow-accent/25">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-fg-strong">
              Talk to your AI Companion
            </span>
            <span className="block truncate text-[12px] text-muted">
              Ask about your {stats.daysCovered} days of memories — decisions, commitments, patterns
              and plans.
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-accent transition group-hover:translate-x-1" />
        </Link>
      </motion.div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Captured today"
          value={formatDuration(stats.todayCaptureSec)}
          sub={`${stats.todayMemories} ${stats.todayMemories === 1 ? "memory" : "memories"} today`}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label={demoMode ? "Memories in store" : "Total memories"}
          value={stats.totalMemories}
          sub={demoMode ? `${stats.demoCount} from demo data` : "your own history"}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Important events today"
          value={stats.importantToday}
          sub="decisions · problems · goals"
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Open commitments"
          value={stats.openActions}
          sub={stats.overdueActions > 0 ? `${stats.overdueActions} overdue` : "none overdue"}
          icon={<ListChecks className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <CapturePanel onSaved={() => void echo.refresh()} />

          <Card
            title="Today at a glance"
            action={
              <Link href="/timeline" className="flex items-center gap-1 text-xs text-accent-2 hover:underline">
                Full timeline <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {todayMemories.length === 0 ? (
              <p className="py-4 text-center text-sm text-dim">
                Nothing captured yet today. Your day starts when you record your first thought.
              </p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {todayMemories.slice(0, 6).map((m) => {
                  const meta = CATEGORY_META[m.category];
                  return (
                    <li key={m.id} className="relative">
                      <span
                        className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-panel"
                        style={{ background: meta.dot }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-dim">{m.time}</span>
                        <button
                          onClick={() => setDrawerId(m.id)}
                          className="text-sm font-medium text-fg transition hover:text-accent-2"
                        >
                          {m.title}
                        </button>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-dim">{m.summary}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card
            title="Recent insights"
            action={
              <Link href="/insights" className="flex items-center gap-1 text-xs text-accent-2 hover:underline">
                All insights <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {computed.length === 0 ? (
              <EmptyState
                title="Insights need a few analyzed memories"
                body="Every insight is computed from real patterns in your captures — nothing is invented. Capture over a couple of days and patterns will surface here."
                icon={<TrendingUp className="h-5 w-5" />}
              />
            ) : (
              <div className="space-y-3">
                {computed.slice(0, 3).map((c) => (
                  <div key={c.key} className="rounded-xl border border-line bg-panel-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                        {c.tone === "attention" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-soft" />
                        ) : (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-soft" />
                        )}
                        {c.title}
                      </span>
                      <Chip color={c.tone === "attention" ? CATEGORY_META.problem : CATEGORY_META.learning}>
                        {c.metric}
                      </Chip>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-dim">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Daily learning score">
            {score ? (
              <div className="flex items-center gap-4">
                <ScoreRing score={score.score} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-muted">
                    {summary?.summary ||
                      "Computed from today's learning moments, decisions, goals and captured time."}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No score yet today"
                body="Capture your first memory of the day and the score will appear — it only counts AI-verified memories."
                icon={<Sparkles className="h-5 w-5" />}
              />
            )}
          </Card>

          <Card
            title="Your brain map"
            action={
              <Link href="/brain" className="flex items-center gap-1 text-xs text-accent-2 hover:underline">
                Explore <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            <BrainPreview memories={todayMemories} />
            <p className="mt-2 text-[11px] leading-relaxed text-dim">
              {todayMemories.length > 0
                ? `Latest ${Math.min(todayMemories.length, 10)} memories, connected by topic, cause and time.`
                : "Nodes appear as memories connect — through people, topics and causes."}
            </p>
          </Card>

          <Card
            title="Current goals"
            action={
              <Link href="/actions" className="text-xs text-accent-2 hover:underline">
                Action Center
              </Link>
            }
          >
            <div className="space-y-2">
              {goals.slice(0, 6).map((g) => (
                <div
                  key={g.id}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => void handleToggleGoal(g.id, g.status)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    title={g.status === "done" ? "Mark goal active" : "Mark goal done"}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        g.status === "done"
                          ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                          : "border-violet-400/40 bg-violet-400/10 text-violet-300"
                      }`}
                    >
                      {g.status === "done" ? (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      ) : (
                        <Target className="h-2.5 w-2.5" />
                      )}
                    </span>
                    <span
                      className={`truncate text-xs ${
                        g.status === "done" ? "text-dim line-through" : "text-muted"
                      }`}
                    >
                      {g.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteGoal(g.id)}
                    className="opacity-0 transition group-hover:opacity-100 text-dim hover:text-rose-300"
                    title="Delete goal"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {goals.length === 0 &&
                profile.goals.slice(0, 5).map((g, i) => (
                  <div
                    key={`p${i}`}
                    className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-2"
                  >
                    <Target className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                    <span className="truncate text-xs text-muted">{g}</span>
                  </div>
                ))}
              {profile.goals.length === 0 && goals.length === 0 && (
                <p className="text-xs text-dim">No goals yet — add one below or capture a memory.</p>
              )}
              <form onSubmit={(e) => void handleAddGoal(e)} className="flex gap-1.5 pt-1">
                <input
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="Add a personal goal…"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs text-fg placeholder:text-dim focus:border-accent/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingGoal || newGoalTitle.trim().length < 2}
                  className="flex items-center gap-1 rounded-lg border border-line bg-panel-3 px-2.5 py-1.5 text-[11px] font-medium text-fg-strong hover:border-accent/40 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </form>
            </div>
          </Card>

          <Card title="Recurring topics">
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <Chip key={t.topic} color={CATEGORY_META.topic}>
                  {t.topic}
                  <span className="text-dim">×{t.count}</span>
                </Chip>
              ))}
              {topics.length === 0 && <p className="text-xs text-dim">Capture something to see topics emerge.</p>}
            </div>
          </Card>

          <Card title="This week's momentum">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3">
              <Flame className="h-5 w-5 text-amber-soft" />
              <p className="text-xs leading-relaxed text-muted">
                {stats.overdueActions > 0
                  ? `${stats.overdueActions} commitment${stats.overdueActions === 1 ? " is" : "s are"} overdue — closing even one rebuilds momentum.`
                  : "All commitments are on track. Your capture streak is building a real knowledge base."}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <MemoryDrawer memoryId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}
