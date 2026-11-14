import { getFlags } from "./env";
import { heuristicExtractFromTranscript, sharedRelationships } from "./extract";
import { extractWithGemini, transcribeAudio, type ExtractedPayload } from "./gemini";
import { getStore, type DomainStore } from "./store";
import type { ActionItem, CaptureResult, Memory, Transcript } from "./types";
import { isoAt, nowTime, todayISO, truncate, uid } from "./util";

async function applyExtractionToMemory(
  store: DomainStore,
  target: Memory,
  ai: ExtractedPayload,
  others: Memory[],
  sourceLabel: string
): Promise<{ updated: Memory; suggestedActions: ActionItem[] }> {
  const updated =
    (await store.updateMemory(target.id, {
      title: ai.title || target.title,
      summary: ai.summary || target.summary,
      category: ai.category,
      topics: ai.topics,
      people: ai.people,
      entities: ai.entities,
      tone: ai.tone,
      goals: ai.goals,
      commitments: ai.commitments,
      problems: ai.problems,
      decisions: ai.decisions,
      followUps: ai.followUps,
      confidence: ai.confidence,
      extractionStatus: "analyzed",
      extractionError: null,
    })) || target;

  const suggestedActions: ActionItem[] = [];
  if (!ai.empty) {
    await store.addRelationships(sharedRelationships(updated, others, 3));

    if (ai.goals.length > 0) {
      const existingGoals = await store.listGoals(false);
      const have = new Set(existingGoals.map((g) => g.title.trim().toLowerCase()));
      for (const gTitle of ai.goals.slice(0, 4)) {
        const clean = truncate(gTitle.trim(), 120);
        if (!clean || have.has(clean.toLowerCase())) continue;
        have.add(clean.toLowerCase());
        await store.addGoal({
          id: uid("goal"),
          userId: store.userId,
          title: clean,
          status: "active",
          sourceMemoryId: target.id,
          createdAt: target.createdAt,
          isDemo: false,
        });
      }
    }

    for (const c of ai.commitments.slice(0, 3)) {
      const action = await store.addAction({
        id: uid("act"),
        userId: store.userId,
        memoryId: target.id,
        title: truncate(c, 90),
        detail: `Suggested from your ${sourceLabel}: "${truncate(c, 120)}"`,
        dueDate: null,
        status: "suggested",
        source: "memory",
        createdAt: target.createdAt,
        completedAt: null,
        isDemo: false,
      });
      suggestedActions.push(action);
    }
  }

  return { updated, suggestedActions };
}

export async function createMemoryFromTranscript(input: {
  transcript: string;
  source: "voice" | "text";
  durationSec?: number;
  mimeType?: string | null;
  transcriptProvider: string;
}): Promise<CaptureResult> {
  const store = await getStore();
  const flags = getFlags();
  const warnings: string[] = [];
  const date = todayISO();
  const time = nowTime();
  const transcript = input.transcript.trim();

  const memory: Memory = {
    id: uid("m"),
    userId: store.userId,
    sessionId: null,
    createdAt: isoAt(date, time),
    date,
    time,
    category: "memory",
    title: truncate(transcript.split(/(?<=[.!?])\s/)[0] || "Captured memory", 70),
    summary: "",
    transcript,
    topics: [],
    people: [],
    entities: [],
    tone: null,
    goals: [],
    commitments: [],
    problems: [],
    decisions: [],
    followUps: [],
    confidence: 0,
    source: input.source,
    transcriptProvider: input.transcriptProvider,
    isDemo: false,
    extractionStatus: "pending",
    extractionError: null,
  };

  let recording = null;
  if (input.source === "voice" && typeof input.durationSec === "number") {
    recording = {
      id: uid("rec"),
      userId: store.userId,
      startedAt: new Date(Date.now() - (input.durationSec || 0) * 1000).toISOString(),
      durationSec: Math.max(1, Math.round(input.durationSec || 0)),
      mimeType: input.mimeType || null,
      sizeBytes: null,
      status: "saved" as const,
      transcriptId: null,
    };
    await store.addRecording(recording);
    memory.sessionId = recording.id;
  }

  const profile = await store.getProfile();
  if (profile.settings.keepTranscripts) {
    const tr: Transcript = {
      id: uid("tr"),
      userId: store.userId,
      recordingId: recording ? recording.id : null,
      text: truncate(transcript, 20000),
      provider: input.transcriptProvider,
      createdAt: memory.createdAt,
    };
    await store.addTranscript(tr);
  }

  const saved = await store.addMemory(memory);
  const recent = await store.listMemories({ demoMode: false, limit: 40 });
  const others = recent.filter((m) => m.id !== saved.id && !m.isDemo);

  let ai: ExtractedPayload | null = null;
  if (flags.gemini) {
    try {
      ai = await extractWithGemini(
        transcript,
        others.slice(0, 8).map((m) => m.title)
      );
    } catch {
      ai = null;
    }
  }

  let usedFallback = false;
  if (!ai) {
    ai = heuristicExtractFromTranscript(transcript);
    usedFallback = true;
    warnings.push(
      flags.gemini
        ? "Used structured fallback extraction because the AI service did not respond in time."
        : "No GEMINI_API_KEY configured — used local structured extraction from your transcript."
    );
  }

  const { updated, suggestedActions } = await applyExtractionToMemory(
    store,
    saved,
    ai,
    others,
    input.source === "voice" ? "voice capture" : "entry"
  );

  if (!ai.empty) {
    return {
      memory: updated,
      extracted: [updated],
      suggestedActions,
      status: "analyzed",
      message: usedFallback
        ? `Saved and structured ${ai.topics.length > 0 ? `topics ${ai.topics.slice(0, 3).join(", ")}` : "your memory"} using offline extraction.`
        : `Extracted ${ai.topics.length > 0 ? `topics ${ai.topics.slice(0, 3).join(", ")}` : "a structured memory"} from your words.`,
      warnings,
      transcriptProvider: input.transcriptProvider,
    };
  }

  warnings.push(
    "The transcript didn't contain enough explicit detail to extract structured facts. Only the transcript is stored."
  );
  return {
    memory: updated,
    extracted: [],
    suggestedActions: [],
    status: "analyzed",
    message: "Captured. Only your transcript is stored — add a bit more detail for structured insights.",
    warnings,
    transcriptProvider: input.transcriptProvider,
  };
}

/** Re-analyzes up to 3 previously failed memories so recoverable captures heal automatically. */
export async function healFailedMemories(memories: Memory[]): Promise<Memory[]> {
  const failed = memories.filter((m) => !m.isDemo && m.extractionStatus === "failed").slice(0, 3);
  if (failed.length === 0) return memories;

  const store = await getStore();
  const flags = getFlags();
  const updatedMap = new Map<string, Memory>();
  const allOthers = memories.filter((m) => !m.isDemo);

  for (const target of failed) {
    const others = allOthers.filter((m) => m.id !== target.id);
    let ai: ExtractedPayload | null = null;
    if (flags.gemini) {
      try {
        ai = await extractWithGemini(
          target.transcript,
          others.slice(0, 8).map((m) => m.title)
        );
      } catch {
        ai = null;
      }
    }
    if (!ai) ai = heuristicExtractFromTranscript(target.transcript);
    const { updated } = await applyExtractionToMemory(
      store,
      target,
      ai,
      others,
      target.source === "voice" ? "voice capture" : "entry"
    );
    updatedMap.set(target.id, updated);
  }

  return memories.map((m) => updatedMap.get(m.id) || m);
}

export async function transcribeOnly(input: {
  audioBase64: string;
  mimeType: string;
}): Promise<{ transcript: string; provider: string }> {
  const flags = getFlags();
  if (!flags.gemini) {
    throw new Error("no_transcription_provider");
  }
  const text = await transcribeAudio(input.audioBase64, input.mimeType);
  if (!text) throw new Error("transcription_failed");
  return { transcript: text.trim(), provider: `gemini (${flags.model})` };
}
