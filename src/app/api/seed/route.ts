import { getStore } from "@/lib/store";
import { fail, handleApiError, ok, readJson } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ action?: string }>(req);
    const action = body.action;
    if (action !== "reseed" && action !== "clear") {
      return fail("action must be 'reseed' or 'clear'", 400);
    }
    const store = await getStore();
    if (action === "reseed") {
      await store.restoreDemo();
    } else {
      await store.clearDemo();
    }
    const profile = await store.getProfile();
    const after = await store.listMemories({ demoMode: profile.settings.demoMode });
    return ok({
      ok: true,
      action,
      memoryCount: after.length,
      demoMode: profile.settings.demoMode,
    });
  } catch (err) {
    return handleApiError(err, "Failed to update demo dataset");
  }
}
