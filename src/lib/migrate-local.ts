import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type {
  ActionItem,
  DailySummary,
  Goal,
  Insight,
  Memory,
  MemoryRelationship,
  Profile,
  Recording,
  Transcript,
} from "./types";
import type { SupabaseStore } from "./store/supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_STORE_PATH = path.join(DATA_DIR, "echo-store.json");
const MIGRATION_STATE_PATH = path.join(DATA_DIR, "echo-migration-state.json");

interface RawLocalStore {
  version?: number;
  profile?: Partial<Profile>;
  memories?: Memory[];
  relationships?: MemoryRelationship[];
  recordings?: Recording[];
  transcripts?: Transcript[];
  actionItems?: ActionItem[];
  insights?: Insight[];
  goals?: Goal[];
  dailySummaries?: DailySummary[];
}

export interface MigrationCounts {
  memories: number;
  recordings: number;
  transcripts: number;
  actionItems: number;
  goals: number;
  relationships: number;
  insights: number;
  dailySummaries: number;
}

export interface MigrationStateFile {
  migratedToUserId: string;
  migratedAt: string;
  sourceFile: string;
  counts: MigrationCounts;
}

export interface MigrationResult {
  status:
    | "migrated"
    | "already-migrated"
    | "already-claimed-by-other-user"
    | "no-local-file"
    | "nothing-to-migrate";
  userId: string;
  counts: MigrationCounts;
  migratedAt?: string;
  preservedLocalBackup: boolean;
  cloudVerifiedCounts?: MigrationCounts;
}

export interface MigrationStatusSummary {
  hasLocalBackup: boolean;
  localRealMemoryCount: number;
  state: MigrationStateFile | null;
  claimedByCurrentUser: boolean;
  claimedByOtherUser: boolean;
}

function emptyCounts(): MigrationCounts {
  return {
    memories: 0,
    recordings: 0,
    transcripts: 0,
    actionItems: 0,
    goals: 0,
    relationships: 0,
    insights: 0,
    dailySummaries: 0,
  };
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function deterministicSlug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return `${base || "item"}_${shortHash(value.toLowerCase().trim())}`;
}

function readLocalStoreFile(): RawLocalStore | null {
  try {
    if (!fs.existsSync(LOCAL_STORE_PATH)) return null;
    return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf8")) as RawLocalStore;
  } catch {
    return null;
  }
}

export function readMigrationState(): MigrationStateFile | null {
  try {
    if (!fs.existsSync(MIGRATION_STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(MIGRATION_STATE_PATH, "utf8")) as MigrationStateFile;
  } catch {
    return null;
  }
}

function writeMigrationState(state: MigrationStateFile): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MIGRATION_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {
    /* ignore on read-only serverless filesystem */
  }
}

function extractRealRecords(raw: RawLocalStore, userId: string, currentProfile: Profile) {
  const allMemories = Array.isArray(raw.memories) ? raw.memories : [];
  const demoMemories = allMemories.filter((m) => m.isDemo || m.source === "seed");
  const realMemoriesRaw = allMemories.filter((m) => !m.isDemo && m.source !== "seed");

  const demoSessionIds = new Set(
    demoMemories.map((m) => m.sessionId).filter((s): s is string => !!s)
  );
  const realMemSessionIds = new Set(
    realMemoriesRaw.map((m) => m.sessionId).filter((s): s is string => !!s)
  );

  const realRecordings: Recording[] = (Array.isArray(raw.recordings) ? raw.recordings : [])
    .filter(
      (r) =>
        realMemSessionIds.has(r.id) ||
        (!demoSessionIds.has(r.id) && !r.id.startsWith("seed"))
    )
    .map((r) => ({
      ...r,
      userId,
    }));
  const recordingIds = new Set(realRecordings.map((r) => r.id));

  const realMemories: Memory[] = realMemoriesRaw.map((m) => ({
    ...m,
    userId,
    sessionId: m.sessionId && recordingIds.has(m.sessionId) ? m.sessionId : null,
    isDemo: false,
    extractionStatus: m.extractionStatus || "analyzed",
    extractionError: m.extractionError || null,
  }));
  const realMemIds = new Set(realMemories.map((m) => m.id));

  const realTranscripts: Transcript[] = (Array.isArray(raw.transcripts) ? raw.transcripts : [])
    .filter(
      (t) =>
        t.provider !== "seed" &&
        !demoSessionIds.has(t.recordingId || "") &&
        (!t.recordingId || recordingIds.has(t.recordingId))
    )
    .map((t) => ({
      ...t,
      userId,
      recordingId: t.recordingId && recordingIds.has(t.recordingId) ? t.recordingId : null,
    }));

  const realActionItems: ActionItem[] = (Array.isArray(raw.actionItems) ? raw.actionItems : [])
    .filter((a) => !a.isDemo)
    .map((a) => ({
      ...a,
      userId,
      memoryId: a.memoryId && realMemIds.has(a.memoryId) ? a.memoryId : null,
      isDemo: false,
    }));

  const goalMap = new Map<string, Goal>();
  for (const g of Array.isArray(raw.goals) ? raw.goals : []) {
    if (g.isDemo) continue;
    const key = g.title.trim().toLowerCase();
    if (!key) continue;
    goalMap.set(key, {
      ...g,
      userId,
      sourceMemoryId: g.sourceMemoryId && realMemIds.has(g.sourceMemoryId) ? g.sourceMemoryId : null,
      isDemo: false,
    });
  }
  const addGoalTitle = (title: string, sourceMemoryId: string | null, createdAt: string) => {
    const clean = title.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (goalMap.has(key)) return;
    goalMap.set(key, {
      id: `goal_mig_${deterministicSlug(clean)}`,
      userId,
      title: clean,
      status: "active",
      sourceMemoryId,
      createdAt,
      isDemo: false,
    });
  };
  for (const title of raw.profile?.goals || []) {
    addGoalTitle(title, null, raw.profile?.createdAt || new Date().toISOString());
  }
  for (const m of realMemories) {
    for (const title of m.goals || []) {
      addGoalTitle(title, m.id, m.createdAt);
    }
  }
  const realGoals = [...goalMap.values()];

  const relList: MemoryRelationship[] = [];
  const pairSeen = new Set<string>();
  for (const r of Array.isArray(raw.relationships) ? raw.relationships : []) {
    if (!realMemIds.has(r.fromId) || !realMemIds.has(r.toId) || r.fromId === r.toId) continue;
    const pairKey = [r.fromId, r.toId].sort().join(":");
    pairSeen.add(pairKey);
    relList.push({
      ...r,
      userId,
    });
  }

  for (let i = 0; i < realMemories.length; i++) {
    for (let j = i + 1; j < realMemories.length; j++) {
      const a = realMemories[i];
      const b = realMemories[j];
      const [first, second] = a.id < b.id ? [a, b] : [b, a];
      const pairKey = `${first.id}:${second.id}`;
      if (pairSeen.has(pairKey)) continue;
      const bTopics = new Set(second.topics.map((t) => t.toLowerCase()));
      const shared = first.topics.filter((t) => bTopics.has(t.toLowerCase()));
      if (shared.length > 0) {
        pairSeen.add(pairKey);
        relList.push({
          id: `rel_mig_${shortHash(pairKey)}`,
          userId,
          fromId: first.id,
          toId: second.id,
          kind: "shared_topic",
          sharedTopics: shared,
          createdAt: second.createdAt || first.createdAt,
        });
      }
    }
  }

  const realDailySummaries: DailySummary[] = (
    Array.isArray(raw.dailySummaries) ? raw.dailySummaries : []
  )
    .filter((s) => !s.isDemo)
    .map((s) => ({
      ...s,
      id: `sum_${userId.slice(0, 8)}_${s.date}`,
      userId,
      isDemo: false,
    }));

  const realInsights: Insight[] = (Array.isArray(raw.insights) ? raw.insights : [])
    .filter((ins) => !ins.isDemo)
    .map((ins) => ({
      ...ins,
      userId,
      evidenceIds: (ins.evidenceIds || []).filter((eid) => realMemIds.has(eid)),
      isDemo: false,
    }));

  let profilePatch: Partial<Profile> | undefined;
  const isUnconfigured =
    !currentProfile.onboarded &&
    currentProfile.goals.length === 0 &&
    currentProfile.improveAreas.length === 0;
  if (isUnconfigured && raw.profile) {
    profilePatch = {
      name: raw.profile.name || currentProfile.name,
      language: raw.profile.language || currentProfile.language,
      timezone: raw.profile.timezone || currentProfile.timezone,
      goals: Array.isArray(raw.profile.goals) ? raw.profile.goals : currentProfile.goals,
      improveAreas: Array.isArray(raw.profile.improveAreas)
        ? raw.profile.improveAreas
        : currentProfile.improveAreas,
      onboarded: !!raw.profile.onboarded,
      settings: {
        keepTranscripts:
          raw.profile.settings?.keepTranscripts ?? currentProfile.settings.keepTranscripts,
        keepAudio: raw.profile.settings?.keepAudio ?? currentProfile.settings.keepAudio,
        demoMode: false,
      },
    };
  }

  return {
    profilePatch,
    recordings: realRecordings,
    transcripts: realTranscripts,
    memories: realMemories,
    relationships: relList,
    actionItems: realActionItems,
    goals: realGoals,
    dailySummaries: realDailySummaries,
    insights: realInsights,
  };
}

export function getMigrationStatus(userId: string): MigrationStatusSummary {
  const raw = readLocalStoreFile();
  const realCount = raw
    ? (raw.memories || []).filter((m) => !m.isDemo && m.source !== "seed").length
    : 0;
  const state = readMigrationState();
  return {
    hasLocalBackup: !!raw,
    localRealMemoryCount: realCount,
    state,
    claimedByCurrentUser: !!state && state.migratedToUserId === userId,
    claimedByOtherUser: !!state && state.migratedToUserId !== userId,
  };
}

const inFlightMigrations = new Map<string, Promise<MigrationResult>>();

export async function maybeMigrateLocalStore(
  store: SupabaseStore,
  userId: string
): Promise<MigrationResult> {
  const existing = inFlightMigrations.get(userId);
  if (existing) return existing;

  const job = (async (): Promise<MigrationResult> => {
    const raw = readLocalStoreFile();
    if (!raw) {
      return {
        status: "no-local-file",
        userId,
        counts: emptyCounts(),
        preservedLocalBackup: false,
      };
    }

    const state = readMigrationState();
    if (state) {
      if (state.migratedToUserId !== userId) {
        return {
          status: "already-claimed-by-other-user",
          userId,
          counts: emptyCounts(),
          migratedAt: state.migratedAt,
          preservedLocalBackup: true,
        };
      }
      return {
        status: "already-migrated",
        userId,
        counts: state.counts,
        migratedAt: state.migratedAt,
        preservedLocalBackup: true,
      };
    }

    return runMigration(store, userId, raw);
  })().finally(() => {
    inFlightMigrations.delete(userId);
  });

  inFlightMigrations.set(userId, job);
  return job;
}

export async function migrateLocalStoreToUser(
  store: SupabaseStore,
  userId: string
): Promise<MigrationResult> {
  const raw = readLocalStoreFile();
  if (!raw) {
    return {
      status: "no-local-file",
      userId,
      counts: emptyCounts(),
      preservedLocalBackup: false,
    };
  }
  const state = readMigrationState();
  if (state && state.migratedToUserId !== userId) {
    return {
      status: "already-claimed-by-other-user",
      userId,
      counts: emptyCounts(),
      migratedAt: state.migratedAt,
      preservedLocalBackup: true,
    };
  }
  return runMigration(store, userId, raw);
}

async function runMigration(
  store: SupabaseStore,
  userId: string,
  raw: RawLocalStore
): Promise<MigrationResult> {
  const currentProfile = await store.getProfile();
  const bundle = extractRealRecords(raw, userId, currentProfile);
  const totalReal =
    bundle.memories.length +
    bundle.recordings.length +
    bundle.transcripts.length +
    bundle.actionItems.length;

  if (totalReal === 0) {
    return {
      status: "nothing-to-migrate",
      userId,
      counts: emptyCounts(),
      preservedLocalBackup: true,
    };
  }

  await store.upsertMigratedBundle(bundle);

  const [memories, recordings, transcriptsCount, actionItems, goals, relationships, insights] =
    await Promise.all([
      store.listMemories({ demoMode: false }),
      store.listRecordings(undefined, false),
      store.countNonSeedTranscripts(),
      store.listActions({ demoMode: false }),
      store.listGoals(false),
      store.listRelationships(),
      store.listInsights(false),
    ]);

  const counts: MigrationCounts = {
    memories: bundle.memories.length,
    recordings: bundle.recordings.length,
    transcripts: bundle.transcripts.length,
    actionItems: bundle.actionItems.length,
    goals: bundle.goals.length,
    relationships: bundle.relationships.length,
    insights: bundle.insights.length,
    dailySummaries: bundle.dailySummaries.length,
  };

  const cloudVerifiedCounts: MigrationCounts = {
    memories: memories.length,
    recordings: recordings.length,
    transcripts: transcriptsCount,
    actionItems: actionItems.length,
    goals: goals.length,
    relationships: relationships.length,
    insights: insights.length,
    dailySummaries: bundle.dailySummaries.length,
  };

  if (memories.length < bundle.memories.length) {
    throw new Error(
      `Migration verification failed: expected at least ${bundle.memories.length} memories in cloud, found ${memories.length}`
    );
  }

  const migratedAt = new Date().toISOString();
  writeMigrationState({
    migratedToUserId: userId,
    migratedAt,
    sourceFile: "data/echo-store.json",
    counts,
  });

  return {
    status: "migrated",
    userId,
    counts,
    cloudVerifiedCounts,
    migratedAt,
    preservedLocalBackup: fs.existsSync(LOCAL_STORE_PATH),
  };
}
