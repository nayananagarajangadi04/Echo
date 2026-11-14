import { handleApiError, ok } from "@/lib/api";
import { getMigrationStatus, migrateLocalStoreToUser } from "@/lib/migrate-local";
import { getStore } from "@/lib/store";
import type { SupabaseStore } from "@/lib/store/supabase";

export async function GET() {
  try {
    const store = await getStore();
    const status = getMigrationStatus(store.userId);
    const [memories, recordings, actionItems, goals, relationships] = await Promise.all([
      store.listMemories({ demoMode: false }),
      store.listRecordings(undefined, false),
      store.listActions({ demoMode: false }),
      store.listGoals(false),
      store.listRelationships(),
    ]);
    return ok({
      userId: store.userId,
      ...status,
      cloudCounts: {
        memories: memories.length,
        recordings: recordings.length,
        actionItems: actionItems.length,
        goals: goals.length,
        relationships: relationships.length,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to read migration status");
  }
}

export async function POST() {
  try {
    const store = await getStore();
    if ("upsertMigratedBundle" in store) {
      const result = await migrateLocalStoreToUser(store as SupabaseStore, store.userId);
      return ok(result);
    }
    return ok({
      status: "no-local-file",
      userId: store.userId,
      counts: {
        memories: 0,
        recordings: 0,
        transcripts: 0,
        actionItems: 0,
        goals: 0,
        relationships: 0,
        insights: 0,
        dailySummaries: 0,
      },
      preservedLocalBackup: true,
    });
  } catch (err) {
    return handleApiError(err, "Migration failed");
  }
}
