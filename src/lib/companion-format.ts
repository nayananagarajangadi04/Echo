import type { CompanionEvidence } from "./retrieval";
import type { CitationRef, Memory, Profile, ProposedAction } from "./types";
import { dateLabel, truncate, uid } from "./util";

/** Normalize minor Unicode lookalikes that LLMs occasionally emit inside IDs. */
export function normalizeMemoryId(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`[\s]+|["'`\]\s]+$/g, "")
    .replace(/^(?:m|M):\s*/, "")
    .replace(/[\u00d7\u2715\u2716]/g, "x")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return 2;
  const prev = new Array<number>(lb + 1);
  const curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

export function resolveCitationRef(
  rawId: string,
  valid: Map<string, CitationRef>,
  normalizedIndex?: Map<string, CitationRef>
): CitationRef | undefined {
  const direct = valid.get(rawId);
  if (direct) return direct;

  const cleaned = normalizeMemoryId(rawId);
  if (!cleaned) return undefined;

  const directCleaned = valid.get(cleaned);
  if (directCleaned) return directCleaned;

  if (normalizedIndex) {
    const byNorm = normalizedIndex.get(cleaned.toLowerCase());
    if (byNorm) return byNorm;
  } else {
    for (const [k, ref] of valid.entries()) {
      if (normalizeMemoryId(k).toLowerCase() === cleaned.toLowerCase()) return ref;
    }
  }

  // Fuzzy match (edit distance <= 1) only on ECHO memory IDs to absorb single-char OCR/LLM typos
  if (/^(?:m_|dm-)/i.test(cleaned) && cleaned.length >= 6) {
    let best: CitationRef | undefined;
    let ties = 0;
    for (const [k, ref] of valid.entries()) {
      const dist = levenshtein(cleaned.toLowerCase(), normalizeMemoryId(k).toLowerCase());
      if (dist === 1) {
        best = ref;
        ties++;
      }
    }
    if (ties === 1 && best) return best;
  }

  return undefined;
}

function buildNormIndex(valid: Map<string, CitationRef>): Map<string, CitationRef> {
  const map = new Map<string, CitationRef>();
  for (const [k, ref] of valid.entries()) {
    map.set(normalizeMemoryId(k).toLowerCase(), ref);
  }
  return map;
}

export function cleanCompanionPunctuation(text: string): string {
  return text
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/[^\S\r\n]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function postProcessCompanionOutput(
  raw: string,
  valid: Map<string, CitationRef>
): { content: string; citations: CitationRef[]; proposedActions: ProposedAction[] } {
  const proposedActions: ProposedAction[] = [];
  const normIndex = buildNormIndex(valid);

  // Extract [ACTION: title | YYYY-MM-DD] blocks cleanly
  let text = raw.replace(/\[ACTION:\s*([^\]\n]+?)\s*\]/gi, (_, inner: string) => {
    const [rawTitle, rawDue] = inner.split("|");
    const cleanTitle = (rawTitle || "").trim();
    const dueMatch = (rawDue || "").trim().match(/^\d{4}-\d{2}-\d{2}$/);
    const dueDate = dueMatch ? dueMatch[0] : null;
    if (cleanTitle.length >= 3 && proposedActions.length < 4) {
      proposedActions.push({
        id: uid("pa"),
        title: truncate(cleanTitle, 110),
        dueDate,
        added: false,
      });
    }
    return "";
  });

  // Remove any truncated trailing [ACTION: block
  text = text.replace(/\[ACTION:[^\]\n]*$/gi, "");

  const used = new Map<string, number>();
  const ordered: CitationRef[] = [];

  const registerCite = (ref: CitationRef): number => {
    if (!used.has(ref.memoryId)) {
      ordered.push(ref);
      used.set(ref.memoryId, ordered.length);
    }
    return used.get(ref.memoryId)!;
  };

  // Replace [M:...] tokens (supports multiple comma/semicolon-separated IDs in one bracket)
  text = text.replace(/\[M:\s*([^\]]+?)\s*\]/gi, (_, inner: string) => {
    const parts = inner
      .split(/[,;|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const nums: number[] = [];
    for (const part of parts) {
      const ref = resolveCitationRef(part, valid, normIndex);
      if (ref) {
        const n = registerCite(ref);
        if (!nums.includes(n)) nums.push(n);
      }
    }
    return nums.map((n) => `[${n}]`).join(" ");
  });

  // Replace or strip any bare ECHO memory IDs outside brackets (e.g., [m_...], (m_...), or bare m_...)
  text = text.replace(
    /\[((?:m_[a-z0-9\u00d7\u2715\u2716-]{5,}_[a-z0-9\u00d7\u2715\u2716-]{4,}|dm-[a-z0-9_-]{3,}))\]/gi,
    (_, id: string) => {
      const ref = resolveCitationRef(id, valid, normIndex);
      return ref ? `[${registerCite(ref)}]` : "";
    }
  );

  text = text.replace(
    /(?<![\w/])((?:m_[a-z0-9\u00d7\u2715\u2716-]{5,}_[a-z0-9\u00d7\u2715\u2716-]{4,}|dm-[a-z0-9_-]{3,}))(?![\w])/gi,
    (_, id: string) => {
      const ref = resolveCitationRef(id, valid, normIndex);
      return ref ? `[${registerCite(ref)}]` : "";
    }
  );

  return {
    content: cleanCompanionPunctuation(text),
    citations: ordered,
    proposedActions,
  };
}

/** Used during live streaming so raw [M:...] / [ACTION:...] tags never flash in the UI. */
export function stripStreamingArtifacts(
  raw: string,
  catalog?: CitationRef[]
): { content: string; citations: CitationRef[] } {
  const withoutIncomplete = raw
    .replace(/\[(?:M:|ACTION:)[^\]\n]*$/i, "")
    .replace(/(?<![\w/])(?:m_|dm-)[a-z0-9_\u00d7-]*$/i, "");

  const valid = new Map<string, CitationRef>();
  for (const ref of catalog || []) {
    valid.set(ref.memoryId, ref);
  }
  const processed = postProcessCompanionOutput(withoutIncomplete, valid);
  return { content: processed.content, citations: processed.citations };
}

/** Repairs any persisted historical assistant messages that still contain raw [M:...] or [ACTION:...] tokens. */
export function repairStoredMessageCitations(
  content: string,
  existingCitations: CitationRef[],
  allMemories: Memory[]
): { content: string; citations: CitationRef[] } {
  const hasRawTokens =
    /\[M:/i.test(content) ||
    /\[ACTION:/i.test(content) ||
    /(?<![\w/])(?:m_[a-z0-9\u00d7-]{5,}_[a-z0-9\u00d7-]{4,}|dm-[a-z0-9_-]{3,})/i.test(content);

  if (!hasRawTokens) {
    return { content, citations: existingCitations };
  }

  const valid = new Map<string, CitationRef>();
  for (const m of allMemories) {
    valid.set(m.id, {
      memoryId: m.id,
      title: m.title,
      date: m.date,
      time: m.time,
    });
  }
  for (const ref of existingCitations) {
    valid.set(ref.memoryId, ref);
  }

  const keepExistingOrder = /\[\d+\]/.test(content) && existingCitations.length > 0;
  if (!keepExistingOrder) {
    const repaired = postProcessCompanionOutput(content, valid);
    return {
      content: repaired.content,
      citations: repaired.citations.length > 0 ? repaired.citations : existingCitations,
    };
  }

  // Merge existing numbered citations with any remaining raw [M:...] tokens
  const normIndex = buildNormIndex(valid);
  const ordered: CitationRef[] = [...existingCitations];
  const used = new Map<string, number>();
  ordered.forEach((c, idx) => used.set(c.memoryId, idx + 1));

  const registerCite = (ref: CitationRef): number => {
    if (!used.has(ref.memoryId)) {
      ordered.push(ref);
      used.set(ref.memoryId, ordered.length);
    }
    return used.get(ref.memoryId)!;
  };

  let text = content.replace(/\[ACTION:\s*[^\]\n]+?\]/gi, "");
  text = text.replace(/\[M:\s*([^\]]+?)\s*\]/gi, (_, inner: string) => {
    const parts = inner
      .split(/[,;|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const nums: number[] = [];
    for (const part of parts) {
      const ref = resolveCitationRef(part, valid, normIndex);
      if (ref) {
        const n = registerCite(ref);
        if (!nums.includes(n)) nums.push(n);
      }
    }
    return nums.map((n) => `[${n}]`).join(" ");
  });
  text = text.replace(
    /(?<![\w/])((?:m_[a-z0-9\u00d7\u2715\u2716-]{5,}_[a-z0-9\u00d7\u2715\u2716-]{4,}|dm-[a-z0-9_-]{3,}))(?![\w])/gi,
    (_, id: string) => {
      const ref = resolveCitationRef(id, valid, normIndex);
      return ref ? `[${registerCite(ref)}]` : "";
    }
  );

  return {
    content: cleanCompanionPunctuation(text),
    citations: ordered,
  };
}

/** Synthesizes a structured Markdown fallback grounded purely in retrieved records when LLM generation is unavailable. */
export function buildStructuredFallbackResponse(
  evidence: CompanionEvidence,
  profile: Profile,
  question: string
): string {
  const userName = profile.displayName || profile.fullName || "there";
  const topMemories = evidence.memories.slice(0, 5);
  const openActions = evidence.actions.filter(
    (a) => a.status === "open" || a.status === "suggested"
  );
  const problems = topMemories.filter(
    (s) => s.memory.category === "problem" || s.memory.problems.length > 0
  );
  const commitments = topMemories.filter((s) => s.memory.commitments.length > 0);
  const winsOrLearnings = topMemories.filter(
    (s) => s.memory.category === "learning" || s.memory.category === "decision"
  );

  const lines: string[] = [];
  const heading = evidence.window?.label
    ? `# Summary for ${evidence.window.label.charAt(0).toUpperCase() + evidence.window.label.slice(1)}`
    : "# Personal Memory Synthesis";
  lines.push(heading);
  lines.push("");

  if (topMemories.length === 0) {
    lines.push(
      `Hi ${userName}, I searched your records for **"${truncate(question, 90)}"**, but couldn't find matching memories yet.`
    );
    lines.push("");
    lines.push("### What you can do next");
    lines.push(
      "- Capture a quick voice note or journal entry in **Capture** so I have concrete details to work from."
    );
    lines.push("- Try asking about a specific topic, person, or timeframe in your records.");
    return lines.join("\n");
  }

  lines.push(
    `Based on **${topMemories.length} retrieved ${
      topMemories.length === 1 ? "memory" : "memories"
    }**${evidence.window?.label ? ` from **${evidence.window.label}**` : ""}, here is a structured breakdown of what happened and what stands out.`
  );
  lines.push("");

  lines.push("### Recorded Events & Observations");
  topMemories.forEach((s, idx) => {
    const m = s.memory;
    const label = `${dateLabel(m.date)}${m.time ? ` · ${m.time}` : ""}`;
    lines.push(`**${idx + 1}. ${m.title}** (${label})`);
    lines.push(`- ${m.summary} [M:${m.id}]`);
    if (m.problems.length > 0) {
      lines.push(`- **Challenge noted:** ${m.problems.slice(0, 2).join("; ")} [M:${m.id}]`);
    }
    if (m.commitments.length > 0) {
      lines.push(`- **Planned commitment:** ${m.commitments.slice(0, 2).join("; ")} [M:${m.id}]`);
    }
    if (m.decisions.length > 0) {
      lines.push(`- **Decision recorded:** ${m.decisions.slice(0, 2).join("; ")} [M:${m.id}]`);
    }
    lines.push("");
  });

  if (evidence.recurringTopics.length > 0 || problems.length > 0 || openActions.length > 0) {
    lines.push("### Patterns & Open Commitments");
    if (evidence.recurringTopics.length > 0) {
      const topTopics = evidence.recurringTopics
        .slice(0, 3)
        .map((t) => `**${t.topic}** (${t.days} days)`)
        .join(", ");
      lines.push(`- **Recurring focus areas:** ${topTopics}.`);
    }
    if (problems.length > 0) {
      lines.push(
        `- **Friction points:** ${problems.length} retrieved ${
          problems.length === 1 ? "entry" : "entries"
        } highlighted unresolved challenges, especially around **${truncate(
          problems[0].memory.title,
          60
        )}** [M:${problems[0].memory.id}].`
      );
    }
    if (openActions.length > 0) {
      openActions.slice(0, 3).forEach((a) => {
        const cite = a.memoryId ? ` [M:${a.memoryId}]` : "";
        lines.push(
          `- **Open action:** ${a.title}${a.dueDate ? ` (due ${dateLabel(a.dueDate)})` : ""}${cite}`
        );
      });
    }
    lines.push("");
  }

  lines.push("### Recommended Next Steps");
  const recs: string[] = [];
  if (openActions.length > 0) {
    recs.push(
      `1. **Close your highest-priority open commitment:** Work on **${openActions[0].title}**${
        openActions[0].dueDate ? ` before **${dateLabel(openActions[0].dueDate)}**` : ""
      }.`
    );
  }
  if (problems.length > 0) {
    const p = problems[0].memory;
    recs.push(
      `${recs.length + 1}. **Break down the blocker from "${truncate(p.title, 48)}":** Spend 20 focused minutes isolating one concrete question or next step [M:${p.id}].`
    );
  }
  if (commitments.length > 0 && openActions.length === 0) {
    const c = commitments[0].memory;
    recs.push(
      `${recs.length + 1}. **Turn your stated intention into a scheduled block:** Follow through on "${truncate(
        c.commitments[0],
        65
      )}" [M:${c.id}].`
    );
  }
  if (winsOrLearnings.length > 0) {
    const w = winsOrLearnings[0].memory;
    recs.push(
      `${recs.length + 1}. **Capture a brief follow-up reflection:** Record what changed after **${truncate(
        w.title,
        50
      )}** [M:${w.id}].`
    );
  }
  if (recs.length === 0) {
    recs.push(
      `1. **Review and follow up on ${truncate(topMemories[0].memory.title, 50)}:** Log one concrete outcome after your next work block [M:${topMemories[0].memory.id}].`
    );
  }
  lines.push(...recs);

  if (openActions.length === 0 && problems.length > 0) {
    lines.push("");
    lines.push(`[ACTION: Resolve next step for ${truncate(problems[0].memory.title, 45)} | ]`);
  }

  return lines.join("\n");
}
