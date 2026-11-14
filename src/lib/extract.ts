import type { ExtractedPayload } from "./gemini";
import type { Memory, MemoryCategory, MemoryRelationship } from "./types";
import { dedupe, isoAt, nowTime, splitSentences, todayISO, tokenize, truncate, uid } from "./util";

const FILLER_TOPICS = new Set([
  "really",
  "thing",
  "things",
  "going",
  "today",
  "tomorrow",
  "yesterday",
  "someone",
  "something",
  "anything",
  "nothing",
  "able",
  "saying",
  "honestly",
  "upcoming",
  "man",
  "one",
  "more",
  "understand",
  "people",
]);

/** Grounded offline/fallback extraction when AI extraction fails or times out. */
export function heuristicExtractFromTranscript(transcript: string): ExtractedPayload {
  const clean = transcript.replace(/\s+/g, " ").trim();
  const sentences = splitSentences(clean);
  const parts = sentences.length > 1 ? sentences : clean.split(/,\s+|\band\b/i).map((s) => s.trim()).filter((s) => s.length > 12);

  const problems = dedupe(
    parts
      .filter((s) =>
        /\b(struggl\w*|confus\w*|stuck|hard|bad day|boring|problem\w*|difficult\w*|issue\w*|frustrat\w*|fail\w*|block\w*)\b/i.test(
          s
        )
      )
      .map((s) => truncate(s, 140))
  ).slice(0, 4);

  const commitments = dedupe(
    parts
      .filter((s) =>
        /\b(have to|need to|must|going to|submit|deadline|due|assignment|exam\w*|promise\w*)\b/i.test(
          s
        )
      )
      .map((s) => truncate(s, 140))
  ).slice(0, 4);

  const decisions = dedupe(
    parts
      .filter((s) => /\b(decid\w*|chose|choose|going with|committed to)\b/i.test(s))
      .map((s) => truncate(s, 140))
  ).slice(0, 4);

  const goals = dedupe(
    parts
      .filter((s) => /\b(want to|goal\w*|aim\w*|prepare for|hoping to|plan to)\b/i.test(s))
      .map((s) => truncate(s, 140))
  ).slice(0, 4);

  const rawTopics = dedupe(tokenize(clean)).filter((t) => t.length >= 4 && !FILLER_TOPICS.has(t));
  const topics = rawTopics.slice(0, 5);

  const people: string[] = [];
  const personMatches = clean.matchAll(
    /\b(?:with|from|professor|prof\.?|in)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)/g
  );
  for (const m of personMatches) {
    const candidate = m[1].trim();
    if (
      candidate &&
      !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Python|Electronics|High|Today)$/i.test(
        candidate
      )
    ) {
      people.push(candidate);
    }
  }

  let category: MemoryCategory = "memory";
  if (problems.length > 0) category = "problem";
  else if (decisions.length > 0) category = "decision";
  else if (goals.length > 0) category = "goal";
  else if (/\b(learn\w*|understand|study\w*|concept|loops?|python|class)\b/i.test(clean)) {
    category = "learning";
  } else if (/\b(habit|daily|routine|every day)\b/i.test(clean)) {
    category = "habit";
  } else if (/\b(idea|brainstorm|what if|concept)\b/i.test(clean)) {
    category = "idea";
  }

  const hasNeg = /\b(bad|struggl\w*|confus\w*|frustrat\w*|hard|boring|worried|stuck)\b/i.test(clean);
  const hasPos = /\b(good|great|happy|alright|excited|shipped|solved|love)\b/i.test(clean);
  const tone = hasNeg && hasPos ? "mixed" : hasNeg ? "negative" : hasPos ? "positive" : null;

  const firstClause = (sentences[0] || parts[0] || clean).replace(/^(?:oh man|honestly|well|so)\s+/i, "");
  const titleBase = truncate(firstClause.charAt(0).toUpperCase() + firstClause.slice(1), 68);
  const summary = truncate(sentences.slice(0, 2).join(" ") || clean, 260);

  return {
    empty: clean.length < 10,
    title: titleBase || "Captured memory",
    summary: summary || clean,
    category,
    topics,
    people: dedupe(people).slice(0, 4),
    entities: [],
    tone,
    goals,
    commitments,
    problems,
    decisions,
    followUps: commitments.slice(0, 2),
    confidence: 0.65,
  };
}

export function sharedRelationships(
  memory: Memory,
  others: Memory[],
  max = 3
): MemoryRelationship[] {
  const scored = others
    .filter((o) => o.id !== memory.id)
    .map((o) => {
      const shared = o.topics.filter((t) => memory.topics.includes(t));
      return { o, shared };
    })
    .filter((s) => s.shared.length > 0)
    .sort((a, b) => {
      if (b.shared.length !== a.shared.length) return b.shared.length - a.shared.length;
      return b.o.createdAt.localeCompare(a.o.createdAt);
    })
    .slice(0, max);
  return scored.map((s) => ({
    id: uid("rel"),
    userId: memory.userId,
    fromId: memory.id,
    toId: s.o.id,
    kind: "shared_topic" as const,
    sharedTopics: s.shared,
    createdAt: isoAt(todayISO(), nowTime()),
  }));
}
