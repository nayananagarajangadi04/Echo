import { getScopedStore } from "@/lib/store";
import { handleApiError, ok, searchParamsOf } from "@/lib/api";
import type { MemoryFilter } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const sp = searchParamsOf(req);
    const { store, demoMode } = await getScopedStore();
    const filter: MemoryFilter = { demoMode };
    if (sp.get("date")) filter.date = sp.get("date")!;
    if (sp.get("from")) filter.from = sp.get("from")!;
    if (sp.get("to")) filter.to = sp.get("to")!;
    if (sp.get("q")) filter.q = sp.get("q")!;
    const categories = sp.get("categories");
    if (categories) filter.categories = categories.split(",").filter(Boolean);
    const limit = sp.get("limit");
    if (limit) filter.limit = Number(limit) || undefined;
    const memories = await store.listMemories(filter);
    return ok({ memories });
  } catch (err) {
    return handleApiError(err, "Failed to list memories");
  }
}
