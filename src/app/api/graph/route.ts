import { getScopedStore } from "@/lib/store";
import { handleApiError, ok, searchParamsOf } from "@/lib/api";
import { buildGraph } from "@/lib/graph";

export async function GET(req: Request) {
  try {
    const sp = searchParamsOf(req);
    const { store, demoMode } = await getScopedStore();
    const memories = await store.listMemories({ demoMode });
    const relationships = await store.listRelationships();
    const entities = await store.listEntities(demoMode);
    const presentIds = new Set(memories.map((m) => m.id));
    const data = buildGraph(
      memories,
      relationships.filter((r) => presentIds.has(r.fromId) && presentIds.has(r.toId)),
      {
        from: sp.get("from") || undefined,
        to: sp.get("to") || undefined,
        categories: sp.get("categories")
          ? sp.get("categories")!.split(",").filter(Boolean)
          : undefined,
        q: sp.get("q") || undefined,
      }
    );
    return ok({ ...data, entities });
  } catch (err) {
    return handleApiError(err, "Failed to load brain map");
  }
}
