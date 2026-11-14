import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { getScopedStore, getStore } from "@/lib/store";
import { truncate, uid } from "@/lib/util";

export async function GET() {
  try {
    const { store, demoMode } = await getScopedStore();
    const goals = await store.listGoals(demoMode);
    return ok({ goals });
  } catch (err) {
    return handleApiError(err, "Failed to list goals");
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ title?: string; sourceMemoryId?: string | null }>(req);
    const title = (body.title || "").trim();
    if (title.length < 2) return fail("Give the goal a short title.", 400);

    const store = await getStore();
    if (body.sourceMemoryId) {
      const mem = await store.getMemory(body.sourceMemoryId);
      if (!mem) return fail("Linked memory not found", 404);
    }

    const existing = await store.listGoals(false);
    const dupe = existing.find(
      (g) => g.title.trim().toLowerCase() === title.toLowerCase() && g.status !== "dropped"
    );
    if (dupe) return ok({ goal: dupe, alreadyExists: true });

    const goal = await store.addGoal({
      id: uid("goal"),
      userId: store.userId,
      title: truncate(title, 120),
      status: "active",
      sourceMemoryId: body.sourceMemoryId || null,
      createdAt: new Date().toISOString(),
      isDemo: false,
    });
    return ok({ goal }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create goal");
  }
}
