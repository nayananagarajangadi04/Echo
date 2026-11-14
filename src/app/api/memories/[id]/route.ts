import { getScopedStore } from "@/lib/store";
import { fail, handleApiError, ok } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { store, demoMode } = await getScopedStore();
    const memory = await store.getMemory(id);
    if (!memory || (!demoMode && memory.isDemo)) return fail("Memory not found", 404);
    const rels = await store.getRelationshipsFor(id);
    const others = await store.listMemories({ demoMode });
    const related = rels
      .map((rel) => {
        const otherId = rel.fromId === id ? rel.toId : rel.fromId;
        const m = others.find((item) => item.id === otherId) || null;
        return m ? { rel, memory: m } : null;
      })
      .filter(Boolean);
    const actions = (await store.listActions({ demoMode })).filter((a) => a.memoryId === id);
    return ok({ memory, related, actions });
  } catch (err) {
    return handleApiError(err, "Failed to read memory");
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { store } = await getScopedStore();
    const memory = await store.getMemory(id);
    if (!memory) return fail("Memory not found", 404);
    await store.deleteMemory(id);
    return ok({ ok: true, message: "Memory deleted." });
  } catch (err) {
    return handleApiError(err, "Failed to delete memory");
  }
}
