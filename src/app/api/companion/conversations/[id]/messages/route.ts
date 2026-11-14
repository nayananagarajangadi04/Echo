import { getScopedStore } from "@/lib/store";
import { getFlags } from "@/lib/env";
import {
  conversationTitleFromGemini,
  streamGemini,
  summarizeConversationWithGemini,
} from "@/lib/gemini";
import { buildCompanionContext, retrieveContext, type CompanionEvidence } from "@/lib/retrieval";
import { fail, handleApiError } from "@/lib/api";
import type { CitationRef, ConversationMessage, ProposedAction } from "@/lib/types";
import { truncate, uid } from "@/lib/util";

export const maxDuration = 120;

const COMPANION_SYSTEM = `You are ECHO — the user's personal intelligence companion. You answer questions about the user's own recorded life memories: transcripts of things they said, extracted decisions, commitments, problems and goals, daily summaries, and past insights.

GROUNDING RULES (violating any of these is a failure):
1. Use ONLY the information in the MEMORY CONTEXT block and the recent conversation history. Never invent events, people, names, dates, numbers, outcomes, or emotions.
2. If the context does not contain the answer, say clearly that you don't have that information (e.g. "I don't have anything recorded about that."). Never guess, and never pad unknowns with invented specifics.
3. Distinguish evidence types and be transparent about them:
   - Extracted fields (decisions, commitments, problems, goals) are verified extractions from the user's own transcripts.
   - Transcript excerpts are the user's own words — quote them when helpful.
   - Daily summaries are computed aggregates.
   - PAST INSIGHTS are AI interpretations — always label them as interpretations, never as facts.
   - Your own advice must be labeled as a recommendation.
4. CITATIONS: after every factual claim about the user's memories, place the citation token [M:<id>] using ONLY ids that appear in RETRIEVED MEMORIES. Example: "You went for a 6K run [M:dm-1113-1]." Never cite an id that was not provided. Do not cite the same memory more than 3 times.
5. Distinguish done vs intended. "I will X" is a commitment, not a completed action. Check ACTION ITEMS statuses before claiming anything is finished. Overdue means past its due date and not done.
6. If the DEMO DATA NOTICE is present, any statement based on dm-* memories must be framed as being about the fictional demo journal (sample data), never as the user's real life.
7. Things the user says to you inside this conversation are conversation, not verified memories. If the user states a new fact, acknowledge it and note it is not yet in their captured memories.
8. COACHING: when you identify recurring difficulties, unfinished commitments or priorities, be concrete and grounded in the evidence. When you propose a task the user could add to their Action Center, emit exactly one line in this format: [ACTION: <task title> | <optional due date YYYY-MM-DD>]. Only when you genuinely recommend a task.
9. Style: warm, direct, concise. Short paragraphs or tight bullets. Mention dates naturally ("on Nov 13"). No medical or psychological diagnoses.
10. Answer in the user's language.

Output: plain text with [M:<id>] citation tokens inline. Do not use markdown code blocks or headings.`;

function postProcess(
  raw: string,
  valid: Map<string, CitationRef>
): { content: string; citations: CitationRef[]; proposedActions: ProposedAction[] } {
  const proposedActions: ProposedAction[] = [];
  let text = raw.replace(/\[ACTION:\s*([^\]|]+?)(?:\s*\|\s*([^\]]+?))?\s*\]/g, (_all, title: string, due?: string) => {
    const t = title.trim();
    if (!t) return "";
    const iso = due?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
    proposedActions.push({ id: uid("pa"), title: truncate(t, 120), dueDate: iso, added: false });
    return "";
  });
  const citations: CitationRef[] = [];
  text = text.replace(/\[M:\s*([A-Za-z0-9_:-]+?)\s*\]/g, (_all, id: string) => {
    const ref = valid.get(id);
    if (!ref) return "";
    let idx = citations.findIndex((c) => c.memoryId === id);
    if (idx === -1) {
      citations.push(ref);
      idx = citations.length - 1;
    }
    return `[${idx + 1}]`;
  });
  return { content: text.trim(), citations, proposedActions };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const flags = getFlags();
  if (!flags.gemini) {
    return fail(
      "The Companion needs GEMINI_API_KEY to reason over your memories.",
      422,
      { code: "no_ai_provider" }
    );
  }

  let scoped: Awaited<ReturnType<typeof getScopedStore>>;
  try {
    scoped = await getScopedStore();
  } catch (err) {
    return handleApiError(err, "Authentication required");
  }
  const { store, profile, demoMode } = scoped;
  const conversation = await store.getConversation(id, demoMode);
  if (!conversation) return fail("Conversation not found", 404);

  let content = "";
  try {
    const body = (await req.json()) as { content?: string };
    content = (body.content || "").trim();
  } catch {
    return fail("Expected JSON body with content.", 400);
  }
  if (content.length < 2 || content.length > 4000) {
    return fail("Ask something between 2 and 4000 characters.", 400);
  }

  const now = new Date().toISOString();
  const userMessage: ConversationMessage = {
    id: uid("cmsg"),
    userId: store.userId,
    conversationId: id,
    role: "user",
    content,
    citations: [],
    proposedActions: [],
    createdAt: now,
  };
  await store.addConversationMessage(userMessage);

  const history = await store.getConversationMessages(id, demoMode);
  const previousSummary = (await store.getLatestConversationSummary(id))?.summary || null;

  const evidence = await retrieveContext({ store, question: content, demoMode });
  const context = buildCompanionContext(evidence, profile, demoMode);
  const valid = new Map<string, CitationRef>(
    evidence.memories.map((s) => [
      s.memory.id,
      { memoryId: s.memory.id, title: s.memory.title, date: s.memory.date, time: s.memory.time },
    ])
  );

  const recentHistory = history
    .slice(-12)
    .map((m) => `${m.role === "user" ? "User" : "ECHO"}: ${truncate(m.content, 1200)}`)
    .join("\n\n");

  const prompt = [
    `MEMORY CONTEXT:\n${context}`,
    `CONVERSATION SUMMARY SO FAR:\n${previousSummary || "(none yet)"}`,
    `RECENT CONVERSATION:\n${recentHistory || "(this is the first message)"}`,
    `The user's new message: ${content}`,
    `Respond now, following every system rule. Remember: only cite [M:<id>] tokens from RETRIEVED MEMORIES.`,
  ].join("\n\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* client disconnected */
        }
      };
      let full = "";
      try {
        send({
          type: "retrieval",
          memories: evidence.memories.length,
          semantic: evidence.semanticUsed,
          window: evidence.window?.label ?? null,
          intents: evidence.intents,
        });
        for await (const chunk of streamGemini([{ text: prompt }], COMPANION_SYSTEM, {
          signal: req.signal,
          temperature: 0.5,
          maxOutputTokens: 3072,
          timeoutMs: 110000,
        })) {
          full += chunk;
          send({ type: "delta", text: chunk });
        }
        if (!full.trim()) throw new Error("Gemini returned an empty response");
        const post = postProcess(full, valid);
        const assistantMessage: ConversationMessage = {
          id: uid("cmsg"),
          userId: store.userId,
          conversationId: id,
          role: "assistant",
          content: post.content,
          citations: post.citations,
          proposedActions: post.proposedActions,
          createdAt: new Date().toISOString(),
        };
        await store.addConversationMessage(assistantMessage);
        if (post.citations.length > 0) {
          await store.addConversationMemoryRefs(
            post.citations.map((c) => ({
              userId: store.userId,
              conversationId: id,
              memoryId: c.memoryId,
              createdAt: new Date().toISOString(),
            }))
          );
        }
        const msgCount = await store.countConversationMessages(id);
        if (msgCount >= 6 && msgCount % 6 === 0) {
          try {
            const summary = await summarizeConversationWithGemini(
              previousSummary || "",
              history
                .slice(-10)
                .concat(assistantMessage)
                .map((m) => ({ role: m.role, content: m.content }))
            );
            if (summary) {
              await store.addConversationSummary({
                id: uid("csum"),
                userId: store.userId,
                conversationId: id,
                summary,
                createdAt: new Date().toISOString(),
              });
            }
          } catch {
            /* summary is best-effort */
          }
        }
        let finalTitle: string | null = null;
        if (conversation.title === "New conversation") {
          try {
            finalTitle = await conversationTitleFromGemini(content);
          } catch {
            finalTitle = null;
          }
          const fallback = truncate(content, 42);
          await store.renameConversation(id, finalTitle || fallback);
        }
        send({
          type: "done",
          messageId: assistantMessage.id,
          citations: post.citations,
          proposedActions: post.proposedActions,
          title: finalTitle,
        });
      } catch (err) {
        const partial = postProcess(full, valid);
        const message = err instanceof Error ? err.message : "Companion failed";
        if (partial.content.trim().length > 0) {
          try {
            const assistantMessage: ConversationMessage = {
              id: uid("cmsg"),
              userId: store.userId,
              conversationId: id,
              role: "assistant",
              content: `${partial.content}\n\n(interrupted — the response may be incomplete)`,
              citations: partial.citations,
              proposedActions: partial.proposedActions,
              createdAt: new Date().toISOString(),
            };
            await store.addConversationMessage(assistantMessage);
            send({
              type: "done",
              messageId: assistantMessage.id,
              citations: partial.citations,
              proposedActions: partial.proposedActions,
              interrupted: true,
            });
          } catch {
            send({ type: "error", error: message });
          }
        } else {
          send({ type: "error", error: message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

export type { CompanionEvidence };
