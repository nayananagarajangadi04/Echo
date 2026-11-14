import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { getScopedStore } from "@/lib/store";
import { uid } from "@/lib/util";

export async function GET() {
  try {
    const { store, demoMode } = await getScopedStore();
    const conversations = await store.listConversations(demoMode);
    return ok({ conversations });
  } catch (err) {
    return handleApiError(err, "Failed to list conversations");
  }
}

export async function POST() {
  try {
    const { store, demoMode } = await getScopedStore();
    const now = new Date().toISOString();
    const conversation = {
      id: uid("conv"),
      userId: store.userId,
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
      summary: null,
      isDemo: demoMode,
    };
    const created = await store.createConversation(conversation);
    return ok({ conversation: created });
  } catch (err) {
    return handleApiError(err, "Failed to create conversation");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await readJson<{ id?: string; title?: string }>(req);
    if (!body.id || !body.title?.trim()) return fail("id and title required", 400);
    const { store, demoMode } = await getScopedStore();
    const conv = await store.getConversation(body.id, demoMode);
    if (!conv) return fail("Conversation not found", 404);
    const renamed = await store.renameConversation(body.id, body.title.trim().slice(0, 80));
    return ok({ conversation: renamed });
  } catch (err) {
    return handleApiError(err, "Failed to rename conversation");
  }
}
