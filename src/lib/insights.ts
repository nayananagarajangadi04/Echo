import type { ActionItem, DailySummary, Insight, Memory } from "./types";
import { clamp, dateLabel, dedupe, shiftDate, todayISO, uid } from "./util";

export interface ComputedInsight {
  key: string;
  title: string;
  body: string;
  evidenceIds: string[];
  metric: string;
  tone: "positive" | "neutral" | "attention";
}

export function windowMemories(memories: Memory[], days = 7): { window: Memory[]; startDate: string; endDate: string } {
  if (memories.length === 0) return { window: [], startDate: shiftDate(todayISO(), -days + 1), endDate: todayISO() };
  const dates = memories.map((m) => m.date).sort();
  const endDate = dates[dates.length - 1];
  const startDate = shiftDate(endDate, -days + 1);
  return { window: memories.filter((m) => m.date >= startDate), startDate, endDate };
}

export function analyzedOnly(memories: Memory[]): Memory[] {
  return memories.filter((m) => m.extractionStatus === "analyzed");
}

export function computeInsights(memories: Memory[], actions: ActionItem[]): ComputedInsight[] {
  const usable = analyzedOnly(memories);
  const { window } = windowMemories(usable, 7);
  const out: ComputedInsight[] = [];
  if (window.length < 3) return out;

  const sorted = [...window].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

  const problems = sorted.filter((m) => m.category === "problem" || m.problems.length > 0);
  const byTopicDays = new Map<string, { ids: string[]; days: Set<string>; titles: string[] }>();
  for (const m of problems) {
    const t = m.topics[0] || "general";
    if (!byTopicDays.has(t)) byTopicDays.set(t, { ids: [], days: new Set(), titles: [] });
    const e = byTopicDays.get(t)!;
    e.ids.push(m.id);
    e.days.add(m.date);
    e.titles.push(m.title);
  }
  const recurring = [...byTopicDays.entries()]
    .filter(([, v]) => v.days.size >= 2)
    .sort((a, b) => b[1].days.size - a[1].days.size);
  for (const [topic, v] of recurring.slice(0, 3)) {
    out.push({
      key: `recurring_${topic.replace(/\W+/g, "_")}`,
      title: `Recurring problem: ${topic}`,
      body: `"${topic}" appeared in ${v.ids.length} memories across ${v.days.size} different days (${[...v.days]
        .sort()
        .map((d) => dateLabel(d))
        .join(", ")}). This is your most repeated friction point in this area.`,
      evidenceIds: dedupe(v.ids).slice(0, 6),
      metric: `${v.days.size} days`,
      tone: "attention",
    });
  }

  const unfinished: { id: string; date: string; text: string; status: string }[] = [];
  for (const m of sorted) {
    for (const c of m.commitments) {
      const linked = actions.filter((a) => a.memoryId === m.id);
      const matched =
        linked.length > 0
          ? linked
          : actions.filter((a) => a.title.toLowerCase().split(/\s+/).some((w) => c.toLowerCase().includes(w)));
      const done = matched.find((a) => a.status === "done");
      if (done) continue;
      const any = matched[0];
      unfinished.push({
        id: m.id,
        date: m.date,
        text: c,
        status: any ? any.status : "untracked",
      });
    }
  }
  if (unfinished.length > 0) {
    out.push({
      key: "open_commitments",
      title: "Open commitments",
      body: unfinished
        .slice(0, 4)
        .map((u) => `- ${dateLabel(u.date)}: "${u.text.slice(0, 100)}" (${u.status})`)
        .join("\n"),
      evidenceIds: dedupe(unfinished.map((u) => u.id)).slice(0, 6),
      metric: `${unfinished.length} open`,
      tone: "attention",
    });
  }

  const topicStats = new Map<string, { count: number; days: Set<string> }>();
  for (const m of sorted) {
    for (const t of m.topics) {
      if (!topicStats.has(t)) topicStats.set(t, { count: 0, days: new Set() });
      topicStats.get(t)!.count++;
      topicStats.get(t)!.days.add(m.date);
    }
  }
  const topTopics = [...topicStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  if (topTopics.length > 0) {
    const topicIds = sorted.filter((m) => m.topics.includes(topTopics[0][0])).map((m) => m.id);
    out.push({
      key: "signature_topics",
      title: "Where your attention goes",
      body: topTopics
        .map(([t, v]) => `- ${t}: ${v.count} memories over ${v.days.size} days`)
        .join("\n"),
      evidenceIds: dedupe(topicIds).slice(0, 6),
      metric: topTopics[0][0],
      tone: "neutral",
    });
  }

  const learningByDay = new Map<string, number>();
  for (const m of sorted) {
    if (m.category === "learning") learningByDay.set(m.date, (learningByDay.get(m.date) || 0) + 1);
  }
  if (learningByDay.size >= 2) {
    const daysSorted = [...learningByDay.keys()].sort();
    const half = Math.floor(daysSorted.length / 2);
    const early = daysSorted.slice(0, half).reduce((a, d) => a + learningByDay.get(d)!, 0);
    const late = daysSorted.slice(half).reduce((a, d) => a + learningByDay.get(d)!, 0);
    const delta = late - early;
    const ids = sorted.filter((m) => m.category === "learning").map((m) => m.id);
    out.push({
      key: "learning_momentum",
      title: delta > 0 ? "Learning momentum is building" : "Learning pace dipped",
      body:
        delta > 0
          ? `Your learning entries accelerated in the second half of the week (${early} → ${late}). Keep the daily session alive.`
          : `Learning entries slowed in the second half of the week (${early} → ${late}). Consider protecting a fixed daily slot.`,
      evidenceIds: dedupe(ids).slice(0, 6),
      metric: delta > 0 ? `+${delta}` : `${delta}`,
      tone: delta > 0 ? "positive" : "attention",
    });
  }

  const goalMems = sorted.filter((m) => m.category === "goal" || m.goals.length > 0);
  for (const g of goalMems.slice(0, 2)) {
    const topic = g.topics[0];
    const supporting = sorted.filter((m) => m.id !== g.id && topic && m.topics.includes(topic));
    out.push({
      key: `goal_${g.id}`,
      title: `Goal consistency: ${truncateWords(g.title, 8)}`,
      body: `You set this goal on ${dateLabel(g.date)} and it connects to ${supporting.length} other ${
        supporting.length === 1 ? "memory" : "memories"
      } in this window (${supporting.slice(0, 3).map((m) => dateLabel(m.date)).join(", ") || "no follow-ups yet"}).`,
      evidenceIds: dedupe([g.id, ...supporting.slice(0, 3).map((m) => m.id)]),
      metric: `${supporting.length} links`,
      tone: supporting.length >= 2 ? "positive" : "attention",
    });
  }

  return out;
}

function truncateWords(s: string, n: number): string {
  const w = s.split(/\s+/);
  return w.length <= n ? s : `${w.slice(0, n).join(" ")}…`;
}

export function dailyScore(
  dayMemories: Memory[],
  captureSec: number
): { score: number; breakdown: Record<string, number> } {
  const analyzed = analyzedOnly(dayMemories);
  const learning = analyzed.filter((m) => m.category === "learning").length;
  const decisions = analyzed.filter((m) => m.category === "decision").length;
  const goals = analyzed.filter((m) => m.category === "goal").length;
  const problems = analyzed.filter((m) => m.category === "problem").length;
  const ideas = analyzed.filter((m) => m.category === "idea").length;
  const minutes = captureSec / 60;
  const breakdown: Record<string, number> = {
    learning: clamp(learning * 10, 0, 25),
    decisions: clamp(decisions * 7, 0, 14),
    goals: clamp(goals * 6, 0, 12),
    capture: clamp(minutes * 0.8, 0, 20),
    ideas: clamp(ideas * 4, 0, 8),
    friction: -clamp(problems * 3, 0, 12),
  };
  const score = clamp(Math.round(40 + Object.values(breakdown).reduce((a, b) => a + b, 0)), 5, 100);
  return { score, breakdown };
}

export function summarizeDay(dayMemories: Memory[], score: number): string {
  if (dayMemories.length === 0) return "No memories captured for this day.";
  const analyzed = analyzedOnly(dayMemories);
  if (analyzed.length === 0) {
    return `${dayMemories.length} ${dayMemories.length === 1 ? "memory" : "memories"} captured — waiting for AI analysis.`;
  }
  const cats = analyzed.map((m) => m.category);
  const counts: Record<string, number> = {};
  for (const c of cats) counts[c] = (counts[c] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const problem = analyzed.find((m) => m.category === "problem");
  const decision = analyzed.find((m) => m.category === "decision");
  const bits: string[] = [];
  bits.push(`${dayMemories.length} memories captured`);
  if (top.length) bits.push(`dominated by ${top.map(([c]) => c).join(", ")}`);
  if (decision) bits.push(`a key decision: "${truncateWords(decision.title, 10)}"`);
  if (problem) bits.push(`one friction point: "${truncateWords(problem.title, 10)}"`);
  return `${bits.join("; ")}. Learning score ${score}/100.`;
}

export interface PlanItem {
  area: string;
  reason: string;
  evidenceIds: string[];
  actions: string[];
}

export function buildImprovementPlan(memories: Memory[], actions: ActionItem[]): PlanItem[] {
  const usable = analyzedOnly(memories);
  const { window } = windowMemories(usable, 7);
  const plan: PlanItem[] = [];
  const recurring = computeInsights(usable, actions).filter((i) => i.tone === "attention");
  for (const ins of recurring.filter((i) => i.key.startsWith("recurring_")).slice(0, 2)) {
    const topic = ins.title.replace(/^Recurring problem: /, "");
    const problemMems = window.filter((m) => m.topics[0] === topic && (m.category === "problem" || m.problems.length > 0));
    plan.push({
      area: topic,
      reason: `${ins.metric} of friction in your memories. Breaking the loop needs one concrete step, not a resolution.`,
      evidenceIds: ins.evidenceIds,
      actions: [
        `Block 25 minutes today to make progress on "${topic}"`,
        problemMems.length > 0
          ? `Write down the exact next step for "${truncateWords(problemMems[0].title, 12)}" before the session`
          : `Set a check-in reminder for "${topic}"`,
      ],
    });
  }
  const unfinished = computeInsights(memories, actions).find((i) => i.key === "open_commitments");
  if (unfinished) {
    plan.push({
      area: "Commitments",
      reason: `${unfinished.metric} commitments are still open. Clearing even one rebuilds trust with yourself.`,
      evidenceIds: unfinished.evidenceIds,
      actions: [
        "Pick the oldest open commitment and either do it or consciously drop it today",
        "Approve one suggested task in your Action Center",
      ],
    });
  }
  return plan.slice(0, 3);
}

export function narrativeReflection(
  kind: "daily" | "weekly",
  memories: Memory[],
  actions: ActionItem[]
): { title: string; body: string; evidenceIds: string[]; metrics: Record<string, string | number> } {
  const isDaily = kind === "daily";
  const today = todayISO();
  const usable = analyzedOnly(memories);
  const scoped = isDaily
    ? usable.filter((m) => m.date === today)
    : windowMemories(usable, 7).window;
  const allScoped = isDaily
    ? memories.filter((m) => m.date === today)
    : windowMemories(memories, 7).window;
  const score = dailyScore(scoped, 0).score;
  const computed = computeInsights(usable, actions);
  const recurring = computed.filter((i) => i.key.startsWith("recurring_"));
  const wins = scoped.filter((m) => m.tone === "positive" || m.category === "learning");
  const problems = scoped.filter((m) => m.category === "problem");
  const openActions = actions.filter((a) => a.status === "open").length;
  const doneActions = actions.filter((a) => a.status === "done").length;

  const title = isDaily
    ? scoped.length > 0
      ? `Daily reflection — ${dateLabel(today)}`
      : `Daily reflection — nothing captured yet`
    : `Weekly reflection — last 7 days`;

  const parts: string[] = [];
  const pendingCount = allScoped.length - scoped.length;
  parts.push(
    isDaily
      ? scoped.length > 0
        ? `You captured ${allScoped.length} ${allScoped.length === 1 ? "memory" : "memories"} today (${scoped.length} AI-analyzed${pendingCount > 0 ? `, ${pendingCount} awaiting analysis` : ""}).`
        : `No memories were captured today. Even one honest voice note gives tomorrow's you more to work with.`
      : `Across the last 7 days you captured ${allScoped.length} memories (${scoped.length} analyzed), completed ${doneActions} commitment${doneActions === 1 ? "" : "s"}, and have ${openActions} still open.`
  );
  if (wins.length > 0) {
    parts.push(
      `What went well: ${wins.slice(0, 3).map((m) => `"${truncateWords(m.title, 10)}" (${dateLabel(m.date)})`).join(", ")}.`
    );
  }
  if (problems.length > 0) {
    parts.push(
      `Friction: ${problems.slice(0, 3).map((m) => `"${truncateWords(m.title, 10)}" (${dateLabel(m.date)})`).join(", ")}.`
    );
  }
  if (recurring.length > 0) {
    parts.push(`${recurring[0].title} — ${recurring[0].body.split(".")[0]}.`);
  }
  parts.push(
    isDaily
      ? `One next step: approve or complete one action in your Action Center before the day ends.`
      : `One next step: pick the most repeated problem above and schedule one focused session against it this week.`
  );

  return {
    title,
    body: parts.join(" "),
    evidenceIds: dedupe([...scoped.slice(0, 8).map((m) => m.id), ...recurring.flatMap((r) => r.evidenceIds)]).slice(0, 10),
    metrics: {
      memories: scoped.length,
      learningScore: score,
      problems: problems.length,
      wins: wins.length,
      openActions,
      doneActions,
    },
  };
}

export function makeInsight(
  kind: "daily" | "weekly",
  data: { title: string; body: string; evidenceIds: string[]; metrics: Record<string, string | number> },
  userId: string
): Insight {
  return {
    id: uid("ins"),
    userId,
    kind,
    date: todayISO(),
    title: data.title,
    body: data.body,
    evidenceIds: data.evidenceIds,
    metrics: data.metrics,
    createdAt: new Date().toISOString(),
    isDemo: false,
  };
}

export function summaryForDate(memories: Memory[], date: string, actions: ActionItem[]): DailySummary | null {
  const day = memories.filter((m) => m.date === date);
  if (day.length === 0) return null;
  const { score } = dailyScore(day, 0);
  const ownerId = memories[0]?.userId || "unknown";
  return {
    id: `sum_${ownerId.slice(0, 8)}_${date}`,
    userId: ownerId,
    date,
    summary: summarizeDay(day, score),
    learningScore: score,
    metrics: {
      memories: day.length,
      learning: day.filter((m) => m.category === "learning").length,
      decisions: day.filter((m) => m.category === "decision").length,
      problems: day.filter((m) => m.category === "problem").length,
    },
    createdAt: new Date().toISOString(),
    isDemo: false,
  };
}
