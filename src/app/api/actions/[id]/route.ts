import { getStore } from "@/lib/store";
import { fail, handleApiError, ok, readJson } from "@/lib/api";
import type { ActionItem } from "@/lib/types";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<Partial<ActionItem>>(req);
    const patch: Partial<ActionItem> = {};
    if (body.status) patch.status = body.status;
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
    if (body.title) patch.title = body.title;
    if (body.status === "done") patch.completedAt = new Date().toISOString();
    if (body.status === "open") patch.completedAt = null;
    const store = await getStore();
    const updated = await store.updateAction(id, patch);
    if (!updated) return fail("Action not found", 404);
    return ok({ action: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update action");
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const store = await getStore();
    await store.deleteAction(id);
    return ok({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete action");
  }
}
