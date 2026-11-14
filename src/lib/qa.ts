import type { ActionItem, Memory } from "./types";
import { dateLabel, dedupe, shiftDate, todayISO, tokenize, truncate } from "./util";

export interface Retrieved {
  memory: Memory;
  score: number;
}

const INTENT_RULES: { intent: string; re: RegExp }[] = [
  { intent: "problems", re: /problem|struggl|stuck|difficult|hard time|issue|blocker/i },
  { intent: "commitments", re: /promise|commit|pledge|said i would|plan(ned)? to/i },
  { intent: "decisions", re: /decision|decide|chose|choose|went with/i },
  { intent: "progress", re: /improv|better at|progress|getting (better|faster)|growth/i },
  { intent: "focus", re: /focus|priorit|what should i|tomorrow|next step/i },
  { intent: "patterns", re: /pattern|recurring|keep|notice|trend|habit|always/i },
  { intent: "learning", re: /learn|stud(y|ying)|understand/i },
  { intent: "goals", re: /goal|target|aim/i },
  { intent: "ideas", re: /idea/i },
  { intent: "yesterday", re: /yesterday/i },
  { intent: "today", re: /\btoday\b/i },
];

const CATEGORY_BY_INTENT: Record<string, string[]> = {
  problems: ["problem"],
  decisions: ["decision"],
  learning: ["learning"],
  goals: ["goal"],
  ideas: ["idea"],
  habits: ["habit"],
};

export function retrieveMemories(
  memories: Memory[],
  question: string,
  limit = 8
): Retrieved[] {
  const tokens = new Set(tokenize(question));
  const sorted = [...memories].sort((a, b) =>
    a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)
  );
  let intent = "default";
  for (const rule of INTENT_RULES) {
    if (rule.re.test(question)) {
      intent = rule.intent;
      break;
    }
  }
  const intentCategories = CATEGORY_BY_INTENT[intent] || [];

  const scored = sorted.map((m, i) => {
    let score = 0;
    const hit = (text: string, weight: number) => {
      const set = new Set(tokenize(text));
      for (const t of tokens) if (set.has(t)) score += weight;
    };
    hit(m.title, 3);
    hit(m.summary, 2);
    for (const t of m.topics) if (tokens.has(t.replace(/\s+/g, "")) || tokens.has(t)) score += 4;
    for (const p of m.people) if (tokens.has(p.toLowerCase())) score += 4;
    hit(m.transcript, 1);
    for (const arr of [m.commitments, m.problems, m.decisions, m.goals]) {
      for (const s of arr) {
        const st = new Set(tokenize(s));
        for (const t of tokens) if (st.has(t)) score += 2;
      }
    }
    if (intentCategories.includes(m.category)) score += 3.5;
    score += Math.max(0, sorted.length - i) * 0.03;
    return { memory: m, score };
  });

  const positive = scored.filter((s) => s.score > 1).sort((a, b) => b.score - a.score);
  if (positive.length >= 2) return positive.slice(0, limit);
  return scored.slice(0, Math.min(limit, 5));
}

export function buildContextBlock(retrieved: Retrieved[]): string {
  return retrieved
    .map(({ memory: m }) => {
      const extras: string[] = [];
      if (m.commitments.length) extras.push(`Commitments: ${m.commitments.join("; ")}`);
      if (m.problems.length) extras.push(`Problems: ${m.problems.join("; ")}`);
      if (m.decisions.length) extras.push(`Decisions: ${m.decisions.join("; ")}`);
      if (m.goals.length) extras.push(`Goals: ${m.goals.join("; ")}`);
      return [
        `[${m.id}] (${m.date} ${m.time}, ${m.category}, topics: ${m.topics.join(", ") || "none"}${m.people.length ? `, people: ${m.people.join(", ")}` : ""})`,
        `Title: ${m.title}`,
        `Summary: ${m.summary}`,
        extras.length ? extras.join(" | ") : "",
        m.transcript ? `Transcript excerpt: "${truncate(m.transcript, 320)}"` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n---\n");
}

function actionStatusFor(memoryId: string, text: string, actions: ActionItem[]): string | null {
  const mine = actions.filter((a) => a.memoryId === memoryId || a.title === text);
  if (mine.length === 0) return null;
  const a = mine[0];
  if (a.status === "done") return "completed";
  if (a.status === "open") return a.dueDate && a.dueDate < todayISO() ? "open and overdue" : "open";
  if (a.status === "suggested") return "suggested, awaiting your approval";
  return a.status;
}

export function heuristicAnswer(
  question: string,
  retrieved: Retrieved[],
  allMemories: Memory[],
  actions: ActionItem[]
): { answer: string; citations: string[]; suggestions: string[] } {
  const today = todayISO();
  const yesterday = shiftDate(today, -1);
  const sortedAll = [...allMemories].sort((a, b) =>
    a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)
  );
  const citations: string[] = [];
  let answer = "";
  let intent = "default";
  for (const rule of INTENT_RULES) {
    if (rule.re.test(question)) {
      intent = rule.intent;
      break;
    }
  }

  const addCite = (ids: string[]) => {
    for (const id of ids) if (!citations.includes(id)) citations.push(id);
  };

  const listMems = (ms: Memory[]) =>
    ms
      .slice(0, 6)
      .map((m) => `- ${m.time} · ${m.title} (${m.category})`)
      .join("\n");

  if (intent === "yesterday" || intent === "today") {
    const target = intent === "yesterday" ? yesterday : today;
    const ms = sortedAll.filter((m) => m.date === target);
    if (ms.length === 0) {
      answer = `I don't have any memories recorded for ${target}. If you captured something, it isn't in my memory store yet.`;
    } else {
      answer = `Here is what I have for ${dateLabel(target)}:\n\n${listMems(ms)}\n\nThat's ${ms.length} ${
        ms.length === 1 ? "memory" : "memories"
      } from that day.`;
      addCite(ms.map((m) => m.id));
    }
  } else if (intent === "commitments") {
    const withC = sortedAll.filter((m) => m.commitments.length > 0).slice(0, 8);
    if (withC.length === 0) {
      answer = "I couldn't find any commitments in your recent memories.";
    } else {
      const lines = withC.map((m) => {
        const c = m.commitments[0];
        const st = actionStatusFor(m.id, c, actions) || "no action item created yet";
        return `- ${dateLabel(m.date)} — "${truncate(c, 120)}" (${st})`;
      });
      answer = `Here are the commitments I found in your memories:\n\n${lines.join(
        "\n"
      )}\n\nOpen ones are waiting in your Action Center for approval or completion.`;
      addCite(withC.map((m) => m.id));
    }
  } else if (intent === "problems") {
    const problems = sortedAll.filter((m) => m.category === "problem" || m.problems.length > 0).slice(0, 8);
    if (problems.length === 0) {
      answer = "I don't have any problems recorded in your memories for this period.";
    } else {
      const lines = problems.map(
        (m) =>
          `- ${dateLabel(m.date)} — ${truncate(m.problems[0] || m.title, 130)} (${m.topics[0] || m.category})`
      );
      answer = `You logged ${problems.length} problem ${
        problems.length === 1 ? "entry" : "entries"
      } recently:\n\n${lines.join("\n")}`;
      const topicDays = new Map<string, Set<string>>();
      for (const m of problems) {
        const t = m.topics[0];
        if (!t) continue;
        if (!topicDays.has(t)) topicDays.set(t, new Set());
        topicDays.get(t)!.add(m.date);
      }
      const recurring = [...topicDays.entries()].filter(([, d]) => d.size >= 2);
      if (recurring.length > 0) {
        answer += `\n\nPattern: "${recurring[0][0]}" shows up on ${recurring[0][1].size} different days — that's the one I'd tackle first.`;
      }
      addCite(problems.map((m) => m.id));
    }
  } else if (intent === "decisions") {
    const ds = sortedAll.filter((m) => m.category === "decision" || m.decisions.length > 0).slice(0, 8);
    if (ds.length === 0) {
      answer = "I couldn't find any decisions in your recorded memories.";
    } else {
      answer = `Your recent decisions:\n\n${ds
        .map((m) => `- ${dateLabel(m.date)} — ${truncate(m.decisions[0] || m.title, 140)}`)
        .join("\n")}`;
      addCite(ds.map((m) => m.id));
    }
  } else if (intent === "progress") {
    const window = sortedAll.slice(0, 24);
    const half = Math.floor(window.length / 2);
    const recent = window.slice(0, half);
    const older = window.slice(half);
    const countBy = (ms: Memory[], f: (m: Memory) => boolean) => ms.filter(f).length;
    const learningDelta = countBy(recent, (m) => m.category === "learning") - countBy(older, (m) => m.category === "learning");
    const problemDelta = countBy(recent, (m) => m.category === "problem") - countBy(older, (m) => m.category === "problem");
    const positives: string[] = [];
    if (learningDelta > 0) positives.push(`learning moments went up (${countBy(older, (m) => m.category === "learning")} → ${countBy(recent, (m) => m.category === "learning")})`);
    if (problemDelta < 0) positives.push(`problem entries went down (${countBy(older, (m) => m.category === "problem")} → ${countBy(recent, (m) => m.category === "problem")})`);
    const doneActions = actions.filter((a) => a.status === "done").length;
    if (doneActions > 0) positives.push(`${doneActions} commitments completed in your Action Center`);
    if (positives.length === 0) {
      answer = "I can't confirm a clear improvement from your memories yet — there isn't enough consistent data to compare periods. Keep capturing and I'll surface trends as they form.";
    } else {
      answer = `Based on your recent memories, you are improving in: ${positives
        .map((p) => `\n- ${p}`)
        .join("")}\n\nKeep the streak alive — your learning entries and completed commitments are the strongest signals.`;
    }
    addCite(window.slice(0, 6).map((m) => m.id));
  } else if (intent === "focus") {
    const today0 = today;
    const overdue = actions.filter((a) => a.status === "open" && a.dueDate && a.dueDate < today0);
    const recurringProblemTopic = (() => {
      const map = new Map<string, Set<string>>();
      for (const m of sortedAll.filter((m) => m.category === "problem")) {
        const t = m.topics[0];
        if (!t) continue;
        if (!map.has(t)) map.set(t, new Set());
        map.get(t)!.add(m.date);
      }
      return [...map.entries()].sort((a, b) => b[1].size - a[1].size)[0];
    })();
    const parts: string[] = [];
    if (overdue.length > 0) {
      parts.push(
        `Close out the overdue commitment "${overdue[0].title}" — it's been pending since ${dateLabel(overdue[0].dueDate!)}.`
      );
      addCite(overdue[0].memoryId ? [overdue[0].memoryId] : []);
    }
    if (recurringProblemTopic) {
      const first = sortedAll.find((m) => m.category === "problem" && m.topics[0] === recurringProblemTopic[0]);
      if (first) {
        parts.push(
          `Spend 25 focused minutes on your "${recurringProblemTopic[0]}" problem — it has appeared on ${recurringProblemTopic[1].size} separate days.`
        );
        addCite([first.id]);
      }
    }
    const todayLearning = sortedAll.filter((m) => m.date === today && m.category === "learning").length;
    if (todayLearning === 0) {
      const lastLearning = sortedAll.find((m) => m.category === "learning");
      if (lastLearning) {
        parts.push(`You haven't logged any learning today — a 30-minute session would keep your streak going (last one: ${dateLabel(lastLearning.date)}).`);
        addCite([lastLearning.id]);
      }
    }
    if (parts.length === 0) {
      answer = "I don't have enough recorded memories to make a grounded suggestion for tomorrow yet.";
    } else {
      answer = `Based on your history, here's what I'd focus on next:\n\n${parts
        .map((p, i) => `${i + 1}. ${p}`)
        .join("\n")}`;
    }
  } else if (intent === "patterns" || intent === "default") {
    const map = new Map<string, { count: number; days: Set<string> }>();
    for (const m of sortedAll) {
      for (const t of m.topics) {
        if (!map.has(t)) map.set(t, { count: 0, days: new Set() });
        map.get(t)!.count++;
        map.get(t)!.days.add(m.date);
      }
    }
    const top = [...map.entries()]
      .filter(([, v]) => v.days.size >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
    const problemCount = sortedAll.filter((m) => m.category === "problem").length;
    if (top.length === 0 && problemCount === 0) {
      answer =
        "I don't have enough memories yet to spot patterns. Capture a few days of your life and I'll start connecting the dots.";
    } else {
      const topicLines = top.map(
        ([t, v]) => `- "${t}" came up in ${v.count} memories across ${v.days.size} days`
      );
      answer = `Here's what stands out in your recent history:\n\n${topicLines.join("\n")}`;
      if (problemCount > 0) {
        answer += `\n\nYou also logged ${problemCount} problem ${
          problemCount === 1 ? "entry" : "entries"
        } — the recurring ones are worth turning into action items.`;
      }
      const topIds = sortedAll
        .filter((m) => m.topics.some((t) => top.some(([tt]) => tt === t)))
        .slice(0, 6)
        .map((m) => m.id);
      addCite(topIds);
    }
  } else if (intent === "learning" || intent === "goals" || intent === "ideas") {
    const cat = intent === "learning" ? "learning" : intent === "goals" ? "goal" : "idea";
    const ms = sortedAll.filter((m) => m.category === cat).slice(0, 8);
    if (ms.length === 0) {
      answer = `I don't have any ${intent} recorded in your memories yet.`;
    } else {
      answer = `${intent.charAt(0).toUpperCase() + intent.slice(1)} from your memories:\n\n${ms
        .map((m) => `- ${dateLabel(m.date)} — ${truncate(m.title, 120)}`)
        .join("\n")}`;
      addCite(ms.map((m) => m.id));
    }
  } else {
    const ms = retrieved.slice(0, 5).map((r) => r.memory);
    if (ms.length === 0) {
      answer = "I couldn't find memories relevant to that question. Try asking about problems, decisions, commitments or a specific day.";
    } else {
      answer = `Here's what your memories say about that:\n\n${ms
        .map((m) => `- ${dateLabel(m.date)} ${m.time} — ${truncate(m.title, 130)} (${m.category})`)
        .join("\n")}\n\nAsk me for more detail on any of these.`;
      addCite(ms.map((m) => m.id));
    }
  }

  const suggestionPool: Record<string, string[]> = {
    problems: ["Which topics do I keep struggling with?", "What should I focus on tomorrow?"],
    commitments: ["What did I promise myself yesterday?", "Which commitments are overdue?"],
    decisions: ["What patterns do you notice in my activities?", "What have I been avoiding?"],
    progress: ["Have I improved in any particular area?", "What should I focus on tomorrow?"],
    focus: ["What did I promise myself yesterday?", "Which topics do I keep struggling with?"],
    patterns: ["What problems did I encounter this week?", "Have I improved in any area?"],
    yesterday: ["What did I decide yesterday?", "What problems did I hit yesterday?"],
    default: ["What problems did I encounter this week?", "What decisions have I made?"],
  };
  const suggestions =
    suggestionPool[intent] || suggestionPool.default;

  return { answer, citations: dedupe(citations).slice(0, 10), suggestions };
}
