import { getScopedStore } from "@/lib/store";
import { fail, handleApiError, ok } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { store, demoMode } = await getScopedStore();
    const conversation = await store.getConversation(id, demoMode);
    if (!conversation) return fail("Conversation not found", 404);
    const messages = await store.getConversationMessages(id, demoMode);
    const allActions = await store.listActions({ demoMode });
    const messagesAnnotated = messages.map((m) => ({
      ...m,
      proposedActions: m.proposedActions.map((p) => ({
        ...p,
        added: allActions.some(
          (a) => a.sourceMessageId === m.id && a.title === p.title && a.status !== "dismissed"
        ),
      })),
    }));
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
