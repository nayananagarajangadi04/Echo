import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { getScopedStore } from "@/lib/store";
import type { ActionItem, ProposedAction } from "@/lib/types";
import { uid } from "@/lib/util";

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      conversationId?: string;
      messageId?: string;
      title?: string;
      dueDate?: string | null;
    }>(req);
    const title = (body.title || "").trim();
    if (!title) return fail("Task title required.", 400);
    const { store, demoMode } = await getScopedStore();

    if (body.messageId) {
      const existing = await store.listActions({ demoMode });
      const dupe = existing.find(
        (a) => a.sourceMessageId === body.messageId && a.title === title && a.status !== "dismissed"
      );
      if (dupe) return ok({ action: dupe, alreadyAdded: true });
    }

    const action: ActionItem = {
      id: uid("act"),
      userId: store.userId,
      memoryId: null,
      title: title.slice(0, 140),
      detail: body.conversationId
        ? `Added from a Companion conversation (${body.conversationId})`
        : null,
      dueDate: body.dueDate || null,
      status: "open",
      source: "user",
      sourceMessageId: body.messageId || null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      isDemo: demoMode,
    };
    const created = await store.addAction(action);
    return ok({ action: created, alreadyAdded: false });
  } catch (err) {
    return handleApiError(err, "Failed to add companion action");
  }
}

export type { ProposedAction };
