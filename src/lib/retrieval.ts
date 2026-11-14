import type {
  ActionItem,
  DailySummary,
  Goal,
  Insight,
  Memory,
  Profile,
} from "./types";
import type { DomainStore } from "./store";
import { embedTexts, cosineSimilarity } from "./gemini";
import {
  dateLabel,
  shiftDate,
  todayISO,
  tokenize,
  truncate,
  splitSentences,
} from "./util";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export interface DateWindow {
  from: string;
  to: string;
  label: string;
  narrow: boolean;
}

export function parseDateWindow(question: string, today = todayISO()): DateWindow | null {
  const q = question.toLowerCase();
  const day = (offset: number) => shiftDate(today, offset);
  if (/\btoday\b|\btonight\b|\bthis morning\b|\bthis afternoon\b/.test(q))
    return { from: day(0), to: day(0), label: "today", narrow: true };
  if (/\byesterday\b/.test(q)) return { from: day(-1), to: day(-1), label: "yesterday", narrow: true };
  const lastN = q.match(/(?:last|past|previous)\s+(\d+)\s+days?/);
  if (lastN) {
    const n = Math.min(90, Math.max(2, Number(lastN[1])));
    return { from: day(-n), to: day(0), label: `the last ${n} days`, narrow: true };
  }
  if (/this week/.test(q)) return { from: day(-6), to: day(0), label: "this week", narrow: true };
  if (/last week/.test(q)) return { from: day(-13), to: day(-7), label: "last week", narrow: true };
  if (/this month/.test(q)) return { from: day(-29), to: day(0), label: "this month", narrow: true };
  const monthMatch = q.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(\d{4}))?/
  );
  if (monthMatch) {
    const month = MONTHS.indexOf(monthMatch[1]);
    const year = monthMatch[2] ? Number(monthMatch[2]) : Number(today.slice(0, 4));
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
    return { from, to, label: monthMatch[1], narrow: true };
  }
  const iso = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return { from: iso[1], to: iso[1], label: iso[1], narrow: true };
  const md = q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/);
  if (md) {
    const month = MONTHS.indexOf(md[1]) + 1;
    const dayNum = md[2].padStart(2, "0");
    const year = Number(today.slice(0, 4));
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${dayNum}`;
    return { from: isoDate, to: isoDate, label: `${md[1]} ${md[2]}`, narrow: true };
  }
  return null;
}

export type CompanionIntent =
  | "commitments"
  | "problems"
  | "patterns"
  | "compare"
  | "plan"
  | "avoid"
  | "learning"
  | "decisions"
  | "ideas"
  | "progress"
  | "general";

export function detectIntents(question: string): CompanionIntent[] {
  const intents: CompanionIntent[] = [];
  const q = question.toLowerCase();
  if (/commit|promise|pledge|pledged|said i would|to-do|todo|task|action item|owe|finish|unfinished|not completed|pending/.test(q)) intents.push("commitments");
  if (/struggl|problem|stuck|difficult|hard|blocker|frustrat|pain|issue|broke/.test(q)) intents.push("problems");
  if (/pattern|recurring|keep|notice|trend|habit|always|usually/.test(q)) intents.push("patterns");
  if (/compare|versus|\bvs\b|difference between|this week|last week|progress/.test(q)) intents.push("compare");
  if (/plan|priorit|tomorrow|next step|what should i|schedule|focus/.test(q)) intents.push("plan");
  if (/avoid|procrastinat|skipp|put(ting)? off|postpon|delay|kept putting/.test(q)) intents.push("avoid");
  if (/learn|stud(y|ies|ying)|course|understand|practice|flashcard/.test(q)) intents.push("learning");
  if (/decid|decision|chose|choose|went with/.test(q)) intents.push("decisions");
  if (/idea|brainstorm|concept/.test(q)) intents.push("ideas");
  if (/improv|better|growth|get(ting) (better|faster)|welled/.test(q)) intents.push("progress");
  return intents.length ? intents : ["general"];
}

const AVOID_RE =
  /\b(avoid|avoids|avoided|avoiding|procrastinat\w*|skip|skips|skipped|skipping|put off|puts off|putting off|postpone[d]?|delay(?:ed)?|didn'?t do|did not do|never (did|started|finished)|kept putting|again)\b/i;

export interface ScoredMemory {
  memory: Memory;
  score: number;
  excerpt: string;
  semantic: number | null;
}

function excerptFor(m: Memory, tokens: Set<string>, maxChars = 420): string {
  if (!m.transcript) return "";
  const sentences = splitSentences(m.transcript);
  if (sentences.length === 0) return "";
  if (tokens.size === 0) return truncate(sentences.slice(0, 2).join(" "), maxChars);
  const scored = sentences.map((s, i) => {
    const set = new Set(tokenize(s));
    let hits = 0;
    for (const t of tokens) if (set.has(t)) hits++;
    return { s, i, hits };
  });
  const best = scored.filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits || a.i - b.i);
  const picked: string[] = [];
  let len = 0;
  for (const b of best) {
    if (len + b.s.length > maxChars) continue;
    picked.push(b.s);
    len += b.s.length;
    if (picked.length >= 3) break;
  }
  if (picked.length === 0) return truncate(sentences.slice(0, 2).join(" "), maxChars);
  picked.sort((a, b) => sentences.indexOf(a) - sentences.indexOf(b));
  return truncate(picked.join(" "), maxChars);
}

export interface RetrievalInput {
  store: DomainStore;
  question: string;
  demoMode: boolean;
  excludeMemoryIds?: string[];
}

export interface CompanionEvidence {
  question: string;
  intents: CompanionIntent[];
  window: DateWindow | null;
  memories: ScoredMemory[];
  actions: ActionItem[];
  goals: Goal[];
  summaries: DailySummary[];
  insights: Insight[];
  recurringTopics: { topic: string; days: number }[];
  semanticUsed: boolean;
}

function keywordScore(m: Memory, tokens: Set<string>, intents: CompanionIntent[], recencyIdx: number, total: number): number {
  let score = 0;
  const hit = (text: string, w: number) => {
    const set = new Set(tokenize(text));
    for (const t of tokens) if (set.has(t)) score += w;
  };
  hit(m.title, 3);
  hit(m.summary, 2);
  for (const t of m.topics) {
    if (tokens.has(t) || tokens.has(t.replace(/\s+/g, ""))) score += 4;
  }
  for (const p of m.people) if (tokens.has(p.toLowerCase())) score += 5;
  hit(m.transcript, 1);
  for (const arr of [m.commitments, m.problems, m.decisions, m.goals]) {
    for (const s of arr) {
      const set = new Set(tokenize(s));
      for (const t of tokens) if (set.has(t)) score += 2;
    }
  }
  if (intents.includes("avoid") && AVOID_RE.test(`${m.title} ${m.summary} ${m.transcript}`)) score += 6;
  if (intents.includes("problems") && (m.category === "problem" || m.problems.length)) score += 3;
  if (intents.includes("commitments") && (m.commitments.length || m.category === "goal")) score += 2.5;
  if (intents.includes("learning") && m.category === "learning") score += 3;
  if (intents.includes("decisions") && (m.category === "decision" || m.decisions.length)) score += 3;
  if (intents.includes("ideas") && m.category === "idea") score += 3;
  score += Math.max(0, total - recencyIdx) * 0.02;
  return score;
}

export async function retrieveContext(input: RetrievalInput): Promise<CompanionEvidence> {
  const { store, question, demoMode } = input;
  const today = todayISO();
  const intents = detectIntents(question);
  const window = parseDateWindow(question, today);
  const tokens = new Set(tokenize(question));

  const [memories, actions, goals, insights] = await Promise.all([
    store.listMemories({ demoMode }),
    store.listActions({ demoMode }),
    store.listGoals(demoMode),
    store.listInsights(demoMode),
  ]);

  const exclude = new Set(input.excludeMemoryIds || []);
  const candidates = memories.filter((m) => !exclude.has(m.id));

  const sortedNewestFirst = [...candidates].sort((a, b) =>
    a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)
  );

  const scored: ScoredMemory[] = sortedNewestFirst.map((m, i) => ({
    memory: m,
    score: keywordScore(m, tokens, intents, i, sortedNewestFirst.length),
    excerpt: excerptFor(m, tokens),
    semantic: null,
  }));

  if (window) {
    for (const s of scored) {
      if (s.memory.date >= window.from && s.memory.date <= window.to) s.score += 8;
      else if (window.narrow) s.score -= 4;
    }
  }

  let semanticUsed = false;
  const embedCandidates = [...scored].sort((a, b) => b.score - a.score).slice(0, 40);
  if (embedCandidates.length > 0) {
    const docCache = getEmbedCache();
    const texts = embedCandidates.map((s) =>
      `${s.memory.title}. ${s.memory.summary}. ${s.memory.transcript}`.slice(0, 4000)
    );
    const keys = embedCandidates.map((s) => `${s.memory.id}|${s.memory.createdAt}`);
    const missingIdx: number[] = [];
    const vecs: (number[] | null)[] = embedCandidates.map((_, i) => docCache.get(keys[i]) || null);
    for (let i = 0; i < keys.length; i++) if (!vecs[i]) missingIdx.push(i);
    if (missingIdx.length > 0) {
      const fresh = await embedTexts(
        missingIdx.map((i) => texts[i]),
        "RETRIEVAL_DOCUMENT"
      );
      if (fresh && fresh.length === missingIdx.length) {
        missingIdx.forEach((idx, j) => {
          docCache.set(keys[idx], fresh[j]);
          vecs[idx] = fresh[j];
        });
        if (docCache.size > 600) trimCache(docCache, keys);
      }
    }
    const qVec = await embedTexts([question], "RETRIEVAL_QUERY");
    if (qVec && qVec[0]) {
      semanticUsed = true;
      let maxSim = 0;
      for (let i = 0; i < embedCandidates.length; i++) {
        if (!vecs[i]) continue;
        const sim = cosineSimilarity(qVec[0], vecs[i]!);
        maxSim = Math.max(maxSim, sim);
        embedCandidates[i].semantic = sim;
      }
      for (const s of embedCandidates) {
        if (s.semantic === null) continue;
        const norm = maxSim > 0 ? s.semantic / maxSim : 0;
        s.score += norm * 6;
      }
    }
  }

  let ranked = scored.filter((s) => s.score > 0.5).sort((a, b) => b.score - a.score);
  if (ranked.length < 4) {
    ranked = [...ranked, ...scored.filter((s) => !ranked.includes(s)).sort((a, b) => b.score - a.score)];
  }
  const memoriesOut = ranked.slice(0, 10);

  const summaries: DailySummary[] = [];
  const summaryDates = new Set<string>();
  for (const s of memoriesOut) summaryDates.add(s.memory.date);
  if (window) {
    for (let d = window.to; d >= window.from && summaryDates.size < 14; d = shiftDate(d, -1)) {
      summaryDates.add(d);
      if (d === window.from) break;
    }
  }
  for (const d of [...summaryDates].slice(0, 8)) {
    const s = await store.getDailySummary(d);
    if (s) summaries.push(s);
  }
  summaries.sort((a, b) => b.date.localeCompare(a.date));

  const topicDays = new Map<string, Set<string>>();
  for (const m of candidates) {
    for (const t of m.topics) {
      if (!topicDays.has(t)) topicDays.set(t, new Set());
      topicDays.get(t)!.add(m.date);
    }
  }
  const recurringTopics = [...topicDays.entries()]
    .filter(([, days]) => days.size >= 2)
    .map(([topic, days]) => ({ topic, days: days.size }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 6);

  return {
    question,
    intents,
    window,
    memories: memoriesOut,
    actions,
    goals,
    summaries,
    insights: insights.slice(0, 5),
    recurringTopics,
    semanticUsed,
  };
}

type EmbedCache = Map<string, number[]>;
let embedCache: EmbedCache | null = null;
function getEmbedCache(): EmbedCache {
  if (!embedCache) embedCache = new Map();
  return embedCache;
}
function trimCache(cache: EmbedCache, currentKeys: string[]): void {
  const keep = new Set(currentKeys);
  for (const k of [...cache.keys()]) if (!keep.has(k) && cache.size > 300) cache.delete(k);
}

export function buildCompanionContext(
  evidence: CompanionEvidence,
  profile: Profile,
  demoMode: boolean
): string {
  const today = todayISO();
  const blocks: string[] = [];

  blocks.push(
    `TODAY: ${today} (${dateLabel(today)}). User: ${
      profile.displayName || profile.fullName || "the user"
    }. Language preference: ${profile.language}.` +
      (profile.goals.length ? `\nStated goals: ${profile.goals.join("; ")}.` : "") +
      (profile.improveAreas.length ? `\nWants to improve: ${profile.improveAreas.join("; ")}.` : "")
  );

  if (demoMode) {
    blocks.push(
      `DEMO DATA NOTICE: The memory store currently contains the ECHO demo dataset — a fictional sample journal belonging to "Alex Rivera" (Nov 9–14, memory ids starting with "dm-"). This is SAMPLE DATA, not the user's real life. You may use it to demonstrate capabilities, but ALWAYS frame answers as being about the demo journal when you rely on dm-* memories. Real user memories have ids starting with "m_".`
    );
  }

  const relevantActions = filterActionsFor(evidence);
  if (relevantActions.length > 0) {
    blocks.push(
      `ACTION ITEMS (user's commitments/tasks; statuses matter):\n` +
        relevantActions
          .map((a) => {
            const overdue = a.status === "open" && a.dueDate && a.dueDate < today;
            return `- [${a.id}] "${a.title}" — status: ${
              overdue ? "open, OVERDUE" : a.status
            }${a.dueDate ? `, due ${dateLabel(a.dueDate)}` : ""}, created ${dateLabel(
              a.createdAt.slice(0, 10)
            )}${a.memoryId ? `, from memory ${a.memoryId}` : ""}${a.isDemo ? " [demo]" : ""}`;
          })
          .join("\n")
    );
  }

  const activeGoals = evidence.goals.filter((g) => g.status === "active").slice(0, 8);
  if (activeGoals.length > 0) {
    blocks.push(
      `GOALS:\n` +
        activeGoals.map((g) => `- "${g.title}" (${g.status}${g.isDemo ? ", demo" : ""})`).join("\n")
    );
  }

  if (evidence.summaries.length > 0) {
    blocks.push(
      `DAILY SUMMARIES (computed from captured memories):\n` +
        evidence.summaries
          .map((s) => `- ${dateLabel(s.date)}: ${truncate(s.summary, 260)}`)
          .join("\n")
    );
  }

  if (evidence.recurringTopics.length > 0) {
    blocks.push(
      `RECURRING TOPICS (topic → number of distinct days it appeared):\n` +
        evidence.recurringTopics.map((t) => `- ${t.topic}: ${t.days} days`).join("\n")
    );
  }

  if (evidence.memories.length > 0) {
    blocks.push(
      `RETRIEVED MEMORIES (cite each with [M:<id>] exactly as shown):\n` +
        evidence.memories
          .map(({ memory: m, excerpt }) => {
            const extras: string[] = [];
            if (m.decisions.length) extras.push(`Decisions: ${m.decisions.join("; ")}`);
            if (m.commitments.length) extras.push(`Commitments: ${m.commitments.join("; ")}`);
            if (m.problems.length) extras.push(`Problems: ${m.problems.join("; ")}`);
            if (m.goals.length) extras.push(`Goals: ${m.goals.join("; ")}`);
            if (m.followUps.length) extras.push(`Follow-ups: ${m.followUps.join("; ")}`);
            return [
              `[M:${m.id}] ${m.date} ${m.time} · ${m.category}${m.isDemo ? " · DEMO" : ""} · confidence ${m.confidence}`,
              `Title: ${m.title}`,
              `Summary: ${m.summary}`,
              extras.length ? extras.join(" | ") : "",
              m.people.length ? `People: ${m.people.join(", ")}` : "",
              excerpt ? `Transcript excerpt: "${excerpt}"` : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n---\n")
    );
  }

  if (evidence.insights.length > 0) {
    blocks.push(
      `PAST INSIGHTS (AI-generated interpretations — treat as interpretations, not verified facts):\n` +
        evidence.insights
          .map((i) => `- ${dateLabel(i.date)} ${i.kind}: ${i.title} — ${truncate(i.body, 320)}`)
          .join("\n")
    );
  }

  return blocks.join("\n\n");
}

function filterActionsFor(evidence: CompanionEvidence): ActionItem[] {
  const tokens = new Set(tokenize(evidence.question));
  const scored = evidence.actions.map((a) => {
    let s = 0;
    const set = new Set(tokenize(`${a.title} ${a.detail || ""}`));
    for (const t of tokens) if (set.has(t)) s += 3;
    if (a.status === "open" || a.status === "suggested") s += 1;
    return { a, s };
  });
  const isOpenish = (a: ActionItem) => a.status === "open" || a.status === "suggested";
  const openish = scored.filter((x) => x.s > 0).sort((x, y) => y.s - x.s);
  const rest = scored.filter((x) => x.s === 0 && isOpenish(x.a));
  return [...openish, ...rest].slice(0, 14).map((x) => x.a);
}
