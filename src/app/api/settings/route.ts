import { getStore, getScopedStore } from "@/lib/store";
import { handleApiError, ok, readJson } from "@/lib/api";
import type { ProfileSettings } from "@/lib/types";

export async function GET() {
  try {
    const { profile } = await getScopedStore();
    return ok({ profile });
  } catch (err) {
    return handleApiError(err, "Failed to read settings");
  }
}

export async function PUT(req: Request) {
  try {
    const body = await readJson<Partial<ProfileSettings>>(req);
    const patch: Partial<ProfileSettings> = {};
    if (typeof body.keepTranscripts === "boolean") patch.keepTranscripts = body.keepTranscripts;
    if (typeof body.keepAudio === "boolean") patch.keepAudio = body.keepAudio;
    if (typeof body.demoMode === "boolean") patch.demoMode = body.demoMode;
    const store = await getStore();
    const profile = await store.updateSettings(patch);
    return ok({ profile });
  } catch (err) {
    return handleApiError(err, "Failed to update settings");
  }
}
