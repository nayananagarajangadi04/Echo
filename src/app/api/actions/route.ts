import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { getScopedStore, getStore } from "@/lib/store";
import { truncate, uid } from "@/lib/util";

export async function GET() {
  try {
    const { store, demoMode } = await getScopedStore();
    const actions = await store.listActions({ demoMode });
    return ok({ actions });
  } catch (err) {
    return handleApiError(err, "Failed to list actions");
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      title?: string;
      detail?: string;
      dueDate?: string | null;
      memoryId?: string | null;
    }>(req);
    const title = (body.title || "").trim();
    if (title.length < 3) return fail("Give the task a short title.", 400);
    const store = await getStore();
    if (body.memoryId) {
      const mem = await store.getMemory(body.memoryId);
      if (!mem) return fail("Linked memory not found", 400);
    }
    const action = await store.addAction({
      id: uid("act"),
      userId: store.userId,
      memoryId: body.memoryId || null,
      title: truncate(title, 120),
      detail: body.detail ? truncate(body.detail, 300) : null,
      dueDate: body.dueDate || null,
      status: "open",
      source: "user",
      createdAt: new Date().toISOString(),
      completedAt: null,
      isDemo: false,
    });
    return ok({ action });
  } catch (err) {
    return handleApiError(err, "Failed to create action");
  }
}
