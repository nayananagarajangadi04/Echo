import { getScopedStore } from "@/lib/store";
import { repairStoredMessageCitations } from "@/lib/companion-format";
import { fail, handleApiError, ok } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { store, demoMode } = await getScopedStore();
    const conversation = await store.getConversation(id, demoMode);
    if (!conversation) return fail("Conversation not found", 404);
    const [messages, allActions, allMemories] = await Promise.all([
      store.getConversationMessages(id, demoMode),
      store.listActions({ demoMode }),
      store.listMemories({ demoMode }),
    ]);
    const messagesAnnotated = messages.map((m) => {
      const repaired =
        m.role === "assistant"
          ? repairStoredMessageCitations(m.content, m.citations, allMemories)
          : { content: m.content, citations: m.citations };
      return {
        ...m,
        content: repaired.content,
        citations: repaired.citations,
        proposedActions: m.proposedActions.map((p) => ({
          ...p,
          added: allActions.some(
            (a) => a.sourceMessageId === m.id && a.title === p.title && a.status !== "dismissed"
          ),
        })),
      };
    });
    return ok({ conversation, messages: messagesAnnotated });
  } catch (err) {
    return handleApiError(err, "Failed to load conversation");
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { store, demoMode } = await getScopedStore();
    const conversation = await store.getConversation(id, demoMode);
    if (!conversation) return fail("Conversation not found", 404);
    await store.deleteConversation(id);
    return ok({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete conversation");
  }
}
