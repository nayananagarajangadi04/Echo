import { getScopedStore } from "@/lib/store";
import { handleApiError, ok, searchParamsOf } from "@/lib/api";
import { summaryForDate } from "@/lib/insights";
import { todayISO } from "@/lib/util";

export async function GET(req: Request) {
  try {
    const sp = searchParamsOf(req);
    const date = sp.get("date") || todayISO();
    const { store, demoMode } = await getScopedStore();
    const memories = await store.listMemories({ date, demoMode });
    const seeded = await store.getDailySummary(date);
    let summary = seeded && (demoMode || !seeded.isDemo) ? seeded : null;
    if (!summary && memories.length > 0) {
      const computed = summaryForDate(memories, date, await store.listActions({ demoMode }));
      if (computed) {
        summary = await store.upsertDailySummary({ ...computed, isDemo: false });
      }
    }
    return ok({ date, memories, summary });
  } catch (err) {
    return handleApiError(err, "Failed to load timeline");
  }
}
