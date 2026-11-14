import { getScopedStore } from "@/lib/store";
import { getFlags } from "@/lib/env";
import { dailyScore, computeInsights } from "@/lib/insights";
import { handleApiError, ok, searchParamsOf } from "@/lib/api";
import { todayISO } from "@/lib/util";
import type { StoreStats } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const date = searchParamsOf(req).get("date") || todayISO();
    const { store, profile, demoMode } = await getScopedStore();
    const flags = getFlags();
    const memories = await store.listMemories({ demoMode });
    const actions = await store.listActions({ demoMode });
    const recordings = await store.listRecordings(date, demoMode);
    const goals = await store.listGoals(demoMode);
    const insights = await store.listInsights(demoMode);
    const summary = await store.getDailySummary(date);

    const todayMems = memories.filter((m) => m.date === date);
    const analyzedToday = todayMems.filter((m) => m.extractionStatus === "analyzed");
    const todayCaptureSec = recordings.reduce((a, r) => a + (r.durationSec || 0), 0);
    const importantToday = analyzedToday.filter((m) =>
      ["decision", "problem", "goal"].includes(m.category)
    ).length;

    const today = todayISO();
    const stats: StoreStats = {
      totalMemories: memories.length,
      demoCount: demoMode ? memories.filter((m) => m.isDemo).length : 0,
      todayMemories: todayMems.length,
      todayCaptureSec,
      importantToday,
      openActions: actions.filter((a) => a.status === "open").length,
      overdueActions: actions.filter((a) => a.status === "open" && a.dueDate && a.dueDate < today).length,
      suggestedActions: actions.filter((a) => a.status === "suggested").length,
      daysCovered: new Set(memories.map((m) => m.date)).size,
      firstDate: memories.length ? memories[0].date : null,
      lastDate: memories.length ? memories[memories.length - 1].date : null,
    };

    const seededSummary = summary && (demoMode || !summary.isDemo) ? summary : null;
    const score =
      seededSummary && analyzedToday.length > 0
        ? { score: seededSummary.learningScore, breakdown: seededSummary.metrics }
        : analyzedToday.length > 0
          ? dailyScore(analyzedToday, todayCaptureSec)
          : null;

    const topicCount = new Map<string, number>();
    for (const m of memories) {
      for (const t of m.topics) topicCount.set(t, (topicCount.get(t) || 0) + 1);
    }
    const topics = [...topicCount.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const computed = computeInsights(memories, actions).slice(0, 4);

    return ok({
      profile,
      flags,
      demoMode,
      stats,
      score,
      topics,
      goals,
      insights: insights.slice(0, 4),
      computed,
      summary: seededSummary,
      todayMemories: todayMems,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load dashboard");
  }
}
