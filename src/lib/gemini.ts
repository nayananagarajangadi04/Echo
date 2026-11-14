import { geminiModel } from "./env";
import type { MemoryCategory } from "./types";
import { clamp, dedupe, truncate } from "./util";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function callGemini(
  parts: unknown[],
  system?: string,
  timeoutMs = 60000
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: "application/json" },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let lastError = "unknown Gemini error";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    try {
      const res = await fetch(
        `${ENDPOINT}/${geminiModel()}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
      if (!res.ok) {
        lastError = `Gemini API error (${res.status}): ${await readError(res)}`;
        if (res.status === 503 || res.status === 429) continue;
        throw new Error(lastError);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
      return text.trim() || null;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Gemini API error")) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`Gemini API error: ${lastError}`);
}

export async function transcribeAudio(base64: string, mimeType: string): Promise<string | null> {
  return callGemini([
    { inlineData: { mimeType, data: base64 } },
    {
      text: "Transcribe this personal voice recording verbatim. Reproduce exactly the words spoken, in the spoken language. Do not summarize, translate, correct, or add anything. Output only the transcript text.",
    },
  ]);
}

export interface ExtractedPayload {
  empty: boolean;
  title: string;
  summary: string;
  category: MemoryCategory;
  topics: string[];
  people: string[];
  entities: string[];
  tone: string | null;
  goals: string[];
  commitments: string[];
  problems: string[];
  decisions: string[];
  followUps: string[];
  confidence: number;
}

const EXTRACT_SYSTEM = `You extract one structured memory record from a person's personal journal transcript. You are the memory-verification layer of a personal intelligence product: accuracy and trust matter more than completeness.

ABSOLUTE RULES — violating any of these is a failure:
- Use ONLY facts explicitly present in the transcript. Copy phrasing from the transcript where possible.
- Never invent events, activities, people, places, numbers, outcomes, or emotions.
- Never claim an activity happened or was completed unless the transcript explicitly says it happened or was completed. "I will go running" is a commitment, NOT a run.
- Never fabricate learning progress, achievements, or streaks.
- People: only names the speaker actually mentions. If no person is mentioned, return an empty array.
- Tone: only set it when the transcript expresses clear emotion, with the speaker's own words as evidence. Otherwise null.
- Ambiguous or unclear information: either omit it or keep the transcript's own hedged wording. Do not resolve ambiguity by guessing.
- If the transcript contains essentially no extractable personal information (gibberish, music, silence, generic chatter), return {"empty": true} and empty arrays — do NOT invent a memory.

Extraction guidelines:
- title: short neutral statement (max 9 words), grounded in the transcript.
- summary: at most 2 sentences, grounded.
- category: exactly one of memory, goal, decision, problem, idea, learning, habit.
- topics: 1-6 short lowercase topic tags explicitly derivable from the transcript.
- commitments: things the speaker says they WILL do or must do (future/obligation). Completed actions belong in summary, not commitments.
- decisions: choices the speaker says they made.
- problems: difficulties, blockers, frustrations the speaker states.
- goals: stated aims or targets.
- followUps: concrete next actions the speaker states.

Output STRICT JSON only:
{"empty": false, "title": "...", "summary": "...", "category": "...", "topics": [], "people": [], "entities": [], "tone": "positive|negative|mixed|null", "goals": [], "commitments": [], "problems": [], "decisions": [], "followUps": [], "confidence": 0.0-1.0}
confidence reflects how cleanly and explicitly the transcript supports this record (0.3 if hedged/sparse, 0.9 if explicit).`;

const CATEGORIES: MemoryCategory[] = [
  "memory",
  "goal",
  "decision",
  "problem",
  "idea",
  "learning",
  "habit",
];

function strArr(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  return dedupe(
    v
      .filter((x) => typeof x === "string" || typeof x === "number")
      .map((x) => truncate(String(x), 160))
      .filter(Boolean)
  ).slice(0, max);
}

export function parseExtracted(raw: string, transcript: string): ExtractedPayload | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const empty = obj.empty === true;
    const category = CATEGORIES.includes(obj.category as MemoryCategory)
      ? (obj.category as MemoryCategory)
      : "memory";
    const toneRaw = typeof obj.tone === "string" ? obj.tone.toLowerCase() : null;
    const tone = ["positive", "negative", "mixed"].includes(toneRaw || "") ? toneRaw : null;
    const title = empty ? "" : truncate(String(obj.title || ""), 90);
    const summary = empty ? "" : truncate(String(obj.summary || ""), 400);
    if (!empty && !title) return null;
    return {
      empty,
      title: title || truncate(transcript.split(/(?<=[.!?])\s/)[0] || "Captured memory", 70),
      summary: summary || truncate(transcript, 240),
      category,
      topics: empty ? [] : strArr(obj.topics, 6).map((t) => t.toLowerCase()),
      people: empty ? [] : strArr(obj.people, 6),
      entities: empty ? [] : strArr(obj.entities, 6),
      tone,
      goals: empty ? [] : strArr(obj.goals),
      commitments: empty ? [] : strArr(obj.commitments),
      problems: empty ? [] : strArr(obj.problems),
      decisions: empty ? [] : strArr(obj.decisions),
      followUps: empty ? [] : strArr(obj.followUps),
      confidence: empty ? 0.3 : clamp(Number(obj.confidence) || 0.55, 0.1, 0.95),
    };
  } catch {
    return null;
  }
}

export async function extractWithGemini(
  transcript: string,
  recentTitles: string[]
): Promise<ExtractedPayload | null> {
  const recent =
    recentTitles.length > 0
      ? `\nKnown recent memory titles (context only — do not import facts from them): ${recentTitles
          .slice(0, 8)
          .join(" | ")}`
      : "";
  const raw = await callGemini(
    [
      {
        text: `Transcript:\n"""\n${truncate(transcript, 8000)}\n"""${recent}\nExtract the memory JSON now. Remember: extract only what the transcript supports; return {"empty": true} if there is nothing meaningful.`,
      },
    ],
    EXTRACT_SYSTEM,
    45000
  );
  if (!raw) return null;
  return parseExtracted(raw, transcript);
}

export async function answerWithGemini(
  question: string,
  context: string,
  profileBlock: string
): Promise<{ answer: string; citations: string[]; suggestions: string[] } | null> {
  const system = `You are ECHO, a personal intelligence companion. You answer questions about the user's own recorded memories.

Hard rules:
- Use ONLY the memories provided in the MEMORY CONTEXT. Never invent events, conversations, names, dates or personal facts.
- Cite memory ids inline using their id in square brackets, e.g. [m_x], for every claim you make.
- If the memories do not contain enough information, explicitly say what is missing and answer with what little is supported. Never guess.
- Distinguish clearly between things the user DID and things the user only SAID they would do.
- Be concise, warm and concrete. Mention dates when relevant. End with one short actionable recommendation grounded in the memories.
- Do not give medical or psychological diagnoses.
${profileBlock}
Output STRICT JSON only:
{"answer": "your answer with [id] citations", "citations": ["memory id", ...], "suggestions": ["follow-up question 1", "follow-up question 2"]}`;

  const raw = await callGemini(
    [
      {
        text: `MEMORY CONTEXT:\n${truncate(context, 24000)}\n\nQUESTION: ${question}\n\nAnswer as JSON.`,
      },
    ],
    system,
    45000
  );
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as {
      answer?: string;
      citations?: unknown;
      suggestions?: unknown;
    };
    if (!obj.answer) return null;
    const ids = dedupe(strArr(obj.citations, 12));
    return {
      answer: truncate(obj.answer, 4000),
      citations: ids,
      suggestions: strArr(obj.suggestions, 3).slice(0, 3),
    };
  } catch {
    return null;
  }
}

export async function reflectWithGemini(
  kind: "daily" | "weekly",
  statsBlock: string
): Promise<{ title: string; body: string } | null> {
  const system = `You write a short, grounded personal reflection for the user based ONLY on the supplied memory evidence.
Rules:
- Reference only what the data shows. No invented events, no fabricated progress.
- Do not present intentions as completed actions.
- No diagnoses. 2 short paragraphs max. Encouraging but honest tone.
- If the data is thin, say so plainly instead of padding.
Output STRICT JSON only: {"title": "...", "body": "..."}`;
  const raw = await callGemini(
    [{ text: `Kind: ${kind}\n\nDATA:\n${truncate(statsBlock, 12000)}\n\nWrite the reflection JSON now.` }],
    system,
    40000
  );
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as { title?: string; body?: string };
    if (!obj.title || !obj.body) return null;
    return { title: truncate(obj.title, 120), body: truncate(obj.body, 2500) };
  } catch {
    return null;
  }
}

export interface StreamOptions {
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function* streamGemini(
  parts: unknown[],
  system: string,
  opts: StreamOptions = {}
): AsyncGenerator<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing");
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
    },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(
      `${ENDPOINT}/${geminiModel()}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${await readError(res)}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Gemini stream has no body");
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const chunk =
            json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
          if (chunk) yield chunk;
        } catch {
          /* skip malformed SSE line */
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

const EMBED_MODELS = ["gemini-embedding-001", "text-embedding-004"];
let embedModelIdx = 0;

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"
): Promise<number[][] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || texts.length === 0 || texts.length > 100) return null;
  for (let i = 0; i < EMBED_MODELS.length; i++) {
    const model = EMBED_MODELS[(embedModelIdx + i) % EMBED_MODELS.length];
    try {
      const res = await fetch(
        `${ENDPOINT}/${model}:batchEmbedContents?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requests: texts.map((t) => ({
              model: `models/${model}`,
              content: { parts: [{ text: truncate(t, 6000) }] },
              taskType,
            })),
          }),
          signal: AbortSignal.timeout(45000),
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { embeddings?: { values: number[] }[] };
      const vecs = data.embeddings?.map((e) => e.values);
      if (!vecs || vecs.length !== texts.length) continue;
      embedModelIdx = (embedModelIdx + i) % EMBED_MODELS.length;
      return vecs;
    } catch {
      continue;
    }
  }
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function conversationTitleFromGemini(firstMessage: string): Promise<string | null> {
  const raw = await callGemini(
    [
      {
        text: `Write a 2-5 word title for a conversation that starts with this message. Reply with JSON only: {"title":"..."}\n\nMessage: """${truncate(
          firstMessage,
          400
        )}"""`,
      },
    ],
    "You generate ultra-short conversation titles. No quotes, no punctuation at the end.",
    20000
  );
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as { title?: string };
    return obj.title ? truncate(obj.title, 60) : null;
  } catch {
    return null;
  }
}

export async function summarizeConversationWithGemini(
  previousSummary: string,
  recent: { role: string; content: string }[]
): Promise<string | null> {
  const transcript = recent
    .map((m) => `${m.role === "user" ? "User" : "ECHO"}: ${truncate(m.content, 500)}`)
    .join("\n");
  const raw = await callGemini(
    [
      {
        text: `Previous summary (may be empty):\n${previousSummary || "(none)"}\n\nRecent messages:\n${transcript}\n\nWrite an updated rolling summary of this conversation in at most 120 words. Capture what was asked, what was found in the user's memories, and any advice given. Facts only.`,
      },
    ],
    "You maintain a factual rolling summary of a conversation between a user and their memory-based AI companion. Never invent content. Plain text only, no JSON.",
    30000
  );
  return raw ? truncate(raw, 1200) : null;
}
