import { getFlags } from "./env";
import { sharedRelationships } from "./extract";
import { extractWithGemini, transcribeAudio } from "./gemini";
import { getStore } from "./store";
import type { CaptureResult, Memory, Transcript } from "./types";
import { isoAt, nowTime, todayISO, truncate, uid } from "./util";

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

  if (!flags.gemini) {
    const err = await store.updateMemory(saved.id, {
      extractionStatus: "pending",
      extractionError:
        "Gemini is not configured. The transcript is saved verbatim; AI extraction is waiting for GEMINI_API_KEY.",
    });
    warnings.push(
      "No GEMINI_API_KEY configured — the transcript was saved exactly as captured, but no AI extraction ran. Nothing was inferred or invented."
    );
    return {
      memory: err || saved,
      extracted: [],
      suggestedActions: [],
      status: "pending",
      message: "Saved your words verbatim. AI analysis will unlock once GEMINI_API_KEY is set.",
      warnings,
      transcriptProvider: input.transcriptProvider,
    };
  }

  try {
    const recent = await store.listMemories({ limit: 10 });
    const ai = await extractWithGemini(
      transcript,
      recent.filter((m) => m.id !== saved.id).map((m) => m.title)
    );
    if (!ai) {
      const err = await store.updateMemory(saved.id, {
        extractionStatus: "failed",
        extractionError: "Gemini returned an invalid response. The transcript is preserved unchanged.",
      });
      warnings.push("AI extraction failed — the transcript is saved but no structured memory was created.");
      return {
        memory: err || saved,
        extracted: [],
        suggestedActions: [],
        status: "failed",
        message: "The AI could not analyze this transcript — your words are preserved and can be deleted.",
        warnings,
        transcriptProvider: input.transcriptProvider,
      };
    }

    const updated = await store.updateMemory(saved.id, {
      title: ai.title,
      summary: ai.summary,
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
    });

    if (!ai.empty) {
      const all = await store.listMemories({ demoMode: false, limit: 40 });
      const others = all.filter((m) => m.id !== saved.id && !m.isDemo);
      await store.addRelationships(sharedRelationships(updated || saved, others, 3));

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
            sourceMemoryId: saved.id,
            createdAt: saved.createdAt,
            isDemo: false,
          });
        }
      }

      const suggestedActions = [];
      for (const c of ai.commitments.slice(0, 3)) {
        const action = await store.addAction({
          id: uid("act"),
          userId: store.userId,
          memoryId: saved.id,
          title: truncate(c, 90),
          detail: `Suggested from your ${input.source === "voice" ? "voice capture" : "entry"}: "${truncate(c, 120)}"`,
          dueDate: null,
          status: "suggested",
          source: "memory",
          createdAt: saved.createdAt,
          completedAt: null,
          isDemo: false,
        });
        suggestedActions.push(action);
      }
      return {
        memory: updated || saved,
        extracted: [updated || saved],
        suggestedActions,
        status: "analyzed",
        message: `Extracted ${ai.topics.length > 0 ? `topics ${ai.topics.slice(0, 3).join(", ")}` : "a structured memory"} from your words.`,
        warnings,
        transcriptProvider: input.transcriptProvider,
      };
    }

    warnings.push(
      "The transcript didn't contain enough explicit information to extract structured facts. Only the transcript is stored."
    );
    return {
      memory: updated || saved,
      extracted: [],
      suggestedActions: [],
      status: "analyzed",
      message: "Captured. There wasn't enough explicit detail to structure — only your transcript is stored.",
      warnings,
      transcriptProvider: input.transcriptProvider,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const err = await store.updateMemory(saved.id, {
      extractionStatus: "failed",
      extractionError: `Gemini extraction failed: ${msg}. The transcript is preserved unchanged.`,
    });
    warnings.push("AI extraction failed — the transcript is saved but no structured memory was created.");
    return {
      memory: err || saved,
      extracted: [],
      suggestedActions: [],
      status: "failed",
      message: "The AI could not analyze this transcript — your words are preserved and can be deleted.",
      warnings,
      transcriptProvider: input.transcriptProvider,
    };
  }
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
