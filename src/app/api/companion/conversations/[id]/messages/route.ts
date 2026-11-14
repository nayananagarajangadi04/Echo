import { getScopedStore } from "@/lib/store";
import { getFlags } from "@/lib/env";
import {
  conversationTitleFromGemini,
  streamGemini,
  summarizeConversationWithGemini,
} from "@/lib/gemini";
import { buildCompanionContext, retrieveContext, type CompanionEvidence } from "@/lib/retrieval";
import {
  buildStructuredFallbackResponse,
  postProcessCompanionOutput,
} from "@/lib/companion-format";
import { fail, handleApiError } from "@/lib/api";
import type { CitationRef, ConversationMessage } from "@/lib/types";
import { truncate, uid } from "@/lib/util";

export const maxDuration = 120;

const COMPANION_SYSTEM = `You are ECHO — a high-clarity Personal Intelligence Assistant. You help the user make sense of their own recorded memories, transcripts, commitments, decisions, problems, daily summaries, and past insights.

RESPONSE STRUCTURE & FORMATTING (REQUIRED):
Write clean, scannable Markdown — NEVER a single wall of text or raw database dump:
1. Opening: Start with a clear \`# Heading\` title reflecting the user's question, followed by a brief 1–2 sentence executive summary of the overall takeaway.
2. Section headings: Organize details under \`### Section Headings\` (such as \`### What happened\`, \`### Key patterns & connections\`, \`### Open commitments & blockers\`, \`### Recommended next steps\`) tailored to the user's question.
3. Short paragraphs & lists:
   - Keep paragraphs to 2–3 concise sentences with blank lines between sections.
   - Use bullet points (\`-\`) with **bold lead-ins** for grouped observations, events, or themes.
   - Use numbered lists (\`1.\`, \`2.\`, \`3.\`) for sequential recommendations or prioritized next steps.
   - Use Markdown tables ONLY when comparing 3+ structured items across columns genuinely makes comparison clearer.
   - Never repeat the same event or bullet point across multiple sections.

INTELLIGENCE & GROUNDING RULES (NON-NEGOTIABLE):
1. Use ONLY information present in MEMORY CONTEXT and RECENT CONVERSATION. Never invent events, people, dates, numbers, outcomes, or emotions.
2. If records do not contain enough information, state clearly what is missing rather than guessing or padding.
3. Connect the dots across memories and days: surface recurring blockers, repeated topics, cause-and-effect links, and tensions between intentions and follow-through.
4. Distinguish evidence types explicitly:
   - **Recorded facts** (what the user experienced, logged, or decided)
   - **Commitments / Intentions** ("I will X" is a plan, NOT a completed outcome; verify ACTION ITEMS status before calling anything done)
   - **Interpretations & Recommendations** (clearly framed as your synthesis or advice, never stated as verified facts)
5. Reference specific events, people, and natural dates (e.g., "on Nov 13") with concrete specificity.
6. If the DEMO DATA NOTICE is present, frame statements from \`dm-*\` memories as coming from the sample demo journal rather than the user's real life.
7. Facts mentioned only in chat (not yet saved as memories) must be acknowledged as conversation notes, not verified records.
8. Keep recommendations practical, warm, specific, and proportional. Never make medical or psychological diagnoses.
9. Answer in the user's language.

CITATIONS & ACTION ITEMS (CRITICAL SYNTAX):
- Cite supporting retrieved memories inline using the exact token \`[M:<id>]\` immediately after the clause or bullet it supports (using ONLY IDs from RETRIEVED MEMORIES).
- Example: \`- You felt blocked configuring parts of the project [M:dm-1113-1].\`
- NEVER write raw internal IDs (like \`m_...\` or \`dm-...\`) without \`[M:...]\` brackets, never combine explanatory prose inside \`[M:...]\`, and never invent an ID.
- When you recommend concrete, high-value tasks the user should track, add up to 2 lines at the very end of your response formatted exactly as:
  \`[ACTION: <concise actionable task title> | <optional YYYY-MM-DD>]\``;

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
          catalog: [...valid.values()],
        });

        try {
          for await (const chunk of streamGemini([{ text: prompt }], COMPANION_SYSTEM, {
            signal: req.signal,
            temperature: 0.45,
            maxOutputTokens: 3072,
            timeoutMs: 110000,
          })) {
            full += chunk;
            send({ type: "delta", text: chunk });
          }
        } catch (streamErr) {
          if (!req.signal.aborted && !full.trim()) {
            full = buildStructuredFallbackResponse(evidence, profile, content);
            send({ type: "delta", text: full });
          } else {
            throw streamErr;
          }
        }

        if (!full.trim()) {
          full = buildStructuredFallbackResponse(evidence, profile, content);
          send({ type: "delta", text: full });
        }

        const post = postProcessCompanionOutput(full, valid);
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
          const resolvedTitle = finalTitle || truncate(content, 42);
          finalTitle = resolvedTitle;
          await store.renameConversation(id, resolvedTitle);
        }
        send({
          type: "done",
          messageId: assistantMessage.id,
          content: post.content,
          citations: post.citations,
          proposedActions: post.proposedActions,
          title: finalTitle,
        });
      } catch (err) {
        const partial = postProcessCompanionOutput(full, valid);
        const message = err instanceof Error ? err.message : "Companion failed";
        if (partial.content.trim().length > 0) {
          try {
            const interruptedContent = `${partial.content}\n\n*(Response was interrupted — partial result shown)*`;
            const assistantMessage: ConversationMessage = {
              id: uid("cmsg"),
              userId: store.userId,
              conversationId: id,
              role: "assistant",
              content: interruptedContent,
              citations: partial.citations,
              proposedActions: partial.proposedActions,
              createdAt: new Date().toISOString(),
            };
            await store.addConversationMessage(assistantMessage);
            send({
              type: "done",
              messageId: assistantMessage.id,
              content: interruptedContent,
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
