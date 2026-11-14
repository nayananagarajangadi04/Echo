import { getScopedStore } from "@/lib/store";
import { handleApiError, ok } from "@/lib/api";
import { computeInsights } from "@/lib/insights";

export async function GET() {
  try {
    const { store, demoMode } = await getScopedStore();
    const memories = await store.listMemories({ demoMode });
    const actions = await store.listActions({ demoMode });
    const reflections = await store.listInsights(demoMode);
    const computed = computeInsights(memories, actions);
    return ok({ computed, reflections, demoMode });
  } catch (err) {
    return handleApiError(err, "Failed to load insights");
  }
}
