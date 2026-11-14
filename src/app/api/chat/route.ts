import { getScopedStore } from "@/lib/store";
import { getFlags } from "@/lib/env";
import { answerWithGemini } from "@/lib/gemini";
import { buildContextBlock, heuristicAnswer, retrieveMemories } from "@/lib/qa";
import { fail, handleApiError, ok, readJson } from "@/lib/api";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ question?: string }>(req);
    const question = (body.question || "").trim();
    if (question.length < 3) return fail("Ask a question first.", 400);

    const { store, profile, demoMode } = await getScopedStore();
    const flags = getFlags();
    const memories = await store.listMemories({ demoMode });
    const actions = await store.listActions({ demoMode });

    if (memories.length === 0) {
      return ok({
        answer: `I don't have any memories${
          demoMode ? "" : " from you yet"
        }. Capture something first — then I can answer questions about your life using your own history.`,
        citations: [],
        suggestions: [],
        provider: "none",
        retrieved: 0,
      });
    }

    const retrieved = retrieveMemories(memories, question, 8);
    let result: { answer: string; citations: string[]; suggestions: string[] } | null = null;
    let provider = "retrieval";

    if (flags.gemini) {
      const profileBlock = [
        profile.displayName ? `User's name: ${profile.displayName}` : "",
        profile.goals.length ? `User's stated goals: ${profile.goals.join("; ")}` : "",
        profile.improveAreas.length
          ? `User wants to improve: ${profile.improveAreas.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      const context = buildContextBlock(retrieved);
      try {
        const ai = await answerWithGemini(question, context, profileBlock);
        if (ai) {
          result = ai;
          provider = `gemini (${flags.model})`;
        }
      } catch {
        result = null;
      }
    }

    if (!result) {
      result = heuristicAnswer(question, retrieved, memories, actions);
      provider = "retrieval";
    }

    const citationMap = new Map(
      memories.map((m) => [m.id, { id: m.id, title: m.title, date: m.date, category: m.category }])
    );
    const citations = result.citations
      .map((id) => citationMap.get(id))
      .filter(Boolean) as { id: string; title: string; date: string; category: string }[];

    return ok({
      ...result,
      citations,
      provider,
      retrieved: retrieved.length,
    });
  } catch (err) {
    return handleApiError(err, "Chat failed");
  }
}
