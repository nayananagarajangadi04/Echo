import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { getStore } from "@/lib/store";
import type { Goal } from "@/lib/types";
import { truncate } from "@/lib/util";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<{ title?: string; status?: Goal["status"] }>(req);
    const store = await getStore();
    const patch: Partial<Goal> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      patch.title = truncate(body.title.trim(), 120);
    }
    if (body.status === "active" || body.status === "done" || body.status === "dropped") {
      patch.status = body.status;
    }
    const updated = await store.updateGoal(id, patch);
    if (!updated) return fail("Goal not found", 404);
    return ok({ goal: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update goal");
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const store = await getStore();
    await store.deleteGoal(id);
    return ok({ deleted: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete goal");
  }
}
