import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ActionItem,
  Conversation,
  ConversationMemoryRef,
  ConversationMessage,
  ConversationSummaryRecord,
  DailySummary,
  EntityRecord,
  Goal,
  Insight,
  Memory,
  MemoryFilter,
  MemoryRelationship,
  Profile,
  ProfileSettings,
  Recording,
  Transcript,
} from "../types";
import { maybeMigrateLocalStore } from "../migrate-local";
import { buildSeedBundle, type SeedBundle } from "../seed-data";
import type { DomainStore } from "./index";

export interface SupabaseAuthIdentity {
  id: string;
  email: string | null;
  userMetadata?: Record<string, unknown>;
}

export interface MigratedBundleInput {
  profilePatch?: Partial<Profile>;
  recordings: Recording[];
  transcripts: Transcript[];
  memories: Memory[];
  relationships: MemoryRelationship[];
  actionItems: ActionItem[];
  goals: Goal[];
  dailySummaries: DailySummary[];
  insights: Insight[];
}

const DEFAULT_SETTINGS: ProfileSettings = {
  keepTranscripts: true,
  keepAudio: false,
  demoMode: false,
};

const VALID_CATEGORIES = new Set<Memory["category"]>([
  "memory",
  "person",
  "goal",
  "decision",
  "problem",
  "idea",
  "learning",
  "habit",
]);

function metaString(meta: Record<string, unknown>, key: string): string {
  const val = meta[key];
  return typeof val === "string" ? val.trim() : "";
}

function normalizeDateOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeTone(v: string | null | undefined): Memory["tone"] {
  return v === "positive" || v === "negative" || v === "mixed" ? v : null;
}

function normalizeCategory(v: string | null | undefined): Memory["category"] {
  return v && VALID_CATEGORIES.has(v as Memory["category"])
    ? (v as Memory["category"])
    : "memory";
}

function prefixSeedBundle(seed: SeedBundle, userId: string): SeedBundle {
  const p = userId.slice(0, 8);
  const pid = (id: string) => `${p}:${id}`;
  const mpid = (id: string | null | undefined) => (id ? pid(id) : null);

  return {
    memories: seed.memories.map((m) => ({
      ...m,
      id: pid(m.id),
      userId,
      sessionId: mpid(m.sessionId),
      isDemo: true,
    })),
    relationships: seed.relationships.map((r) => ({
      ...r,
      id: pid(r.id),
      userId,
      fromId: pid(r.fromId),
      toId: pid(r.toId),
    })),
    recordings: seed.recordings.map((r) => ({
      ...r,
      id: pid(r.id),
      userId,
      transcriptId: mpid(r.transcriptId),
    })),
    transcripts: seed.transcripts.map((t) => ({
      ...t,
      id: pid(t.id),
      userId,
      recordingId: mpid(t.recordingId),
    })),
    actionItems: seed.actionItems.map((a) => ({
      ...a,
      id: pid(a.id),
      userId,
      memoryId: mpid(a.memoryId),
      sourceMessageId: mpid(a.sourceMessageId),
      isDemo: true,
    })),
    goals: seed.goals.map((g) => ({
      ...g,
      id: pid(g.id),
      userId,
      sourceMemoryId: mpid(g.sourceMemoryId),
      isDemo: true,
    })),
    dailySummaries: seed.dailySummaries.map((s) => ({
      ...s,
      id: pid(s.id),
      userId,
      isDemo: true,
    })),
    insights: seed.insights.map((ins) => ({
      ...ins,
      id: pid(ins.id),
      userId,
      evidenceIds: (ins.evidenceIds || []).map(pid),
      isDemo: true,
    })),
    conversations: (seed.conversations || []).map((c) => ({
      ...c,
      id: pid(c.id),
      userId,
      isDemo: true,
    })),
    conversationMessages: (seed.conversationMessages || []).map((m) => ({
      ...m,
      id: pid(m.id),
      userId,
      conversationId: pid(m.conversationId),
      citations: (m.citations || []).map((c) => ({ ...c, memoryId: pid(c.memoryId) })),
    })),
    conversationSummaries: (seed.conversationSummaries || []).map((s) => ({
      ...s,
      id: pid(s.id),
      userId,
      conversationId: pid(s.conversationId),
    })),
    conversationMemoryRefs: (seed.conversationMemoryRefs || []).map((r) => ({
      ...r,
      id: `${pid(r.conversationId)}:${pid(r.memoryId)}`,
      userId,
      conversationId: pid(r.conversationId),
      memoryId: pid(r.memoryId),
    })),
  };
}

export class SupabaseStore implements DomainStore {
  readonly userId: string;
  private client: SupabaseClient;
  private email: string | null;
  private userMetadata: Record<string, unknown>;
  private initialized = false;

  constructor(
    clientOrUrl: SupabaseClient | string,
    userOrKey: SupabaseAuthIdentity | string,
    fallbackUserId?: string
  ) {
    if (typeof clientOrUrl === "string") {
      if (!fallbackUserId) {
        throw new Error("SupabaseStore requires an explicit authenticated userId.");
      }
      this.client = createClient(clientOrUrl, userOrKey as string, {
        auth: { persistSession: false },
      });
      this.userId = fallbackUserId;
      this.email = null;
      this.userMetadata = {};
    } else {
      const identity = userOrKey as SupabaseAuthIdentity;
      if (!identity?.id) {
        throw new Error("SupabaseStore requires an authenticated user.");
      }
      this.client = clientOrUrl;
      this.userId = identity.id;
      this.email = identity.email ?? null;
      this.userMetadata = identity.userMetadata ?? {};
    }
  }

  private check(error: { message: string } | null, context: string): void {
    if (error) throw new Error(`Supabase ${context} failed: ${error.message}`);
  }

  private mapMemoryRow(m: Memory) {
    return {
      id: m.id,
      user_id: this.userId,
      session_id: m.sessionId,
      created_at: m.createdAt,
      date: m.date,
      time: m.time,
      category: normalizeCategory(m.category),
      title: m.title,
      summary: m.summary || "",
      transcript: m.transcript || "",
      topics: m.topics || [],
      people: m.people || [],
      entities: m.entities || [],
      tone: normalizeTone(m.tone),
      goals: m.goals || [],
      commitments: m.commitments || [],
      problems: m.problems || [],
      decisions: m.decisions || [],
      follow_ups: m.followUps || [],
      confidence: typeof m.confidence === "number" ? m.confidence : 0.6,
      source: m.source || "voice",
      transcript_provider: m.transcriptProvider || "unknown",
      is_demo: !!m.isDemo,
      extraction_status: m.extractionStatus || "analyzed",
      extraction_error: m.extractionError || null,
    };
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", this.userId)
      .maybeSingle();
    this.check(error, "profile read on init");

    const metaFull = metaString(this.userMetadata, "full_name") || metaString(this.userMetadata, "name");
    const emailPrefix = this.email ? this.email.split("@")[0] : "";
    const metaDisplay =
      metaString(this.userMetadata, "given_name") ||
      (metaFull ? metaFull.split(" ")[0] : "") ||
      emailPrefix;
    const metaAvatar =
      metaString(this.userMetadata, "avatar_url") ||
      metaString(this.userMetadata, "picture") ||
      null;

    if (!data) {
      const { error: insErr } = await this.client.from("profiles").upsert(
        {
          id: this.userId,
          user_id: this.userId,
          name: "",
          full_name: metaFull,
          display_name: metaDisplay,
          email: this.email,
          avatar_url: metaAvatar,
          language: "English",
          timezone: "UTC",
          goals: [],
          improve_areas: [],
          onboarded: false,
          settings: DEFAULT_SETTINGS,
        },
        { onConflict: "id" }
      );
      this.check(insErr, "profile bootstrap");
    } else {
      const patch: Record<string, unknown> = {};
      if (!data.user_id) patch.user_id = this.userId;
      if (!data.email && this.email) patch.email = this.email;
      if (!data.avatar_url && metaAvatar) patch.avatar_url = metaAvatar;
      if (!data.full_name && metaFull) patch.full_name = metaFull;
      if (!data.display_name && metaDisplay) patch.display_name = metaDisplay;
      if (!data.settings || typeof (data.settings as ProfileSettings).demoMode !== "boolean") {
        patch.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      }
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await this.client
          .from("profiles")
          .update(patch)
          .eq("id", this.userId);
        this.check(updErr, "profile metadata backfill");
      }
    }

    this.initialized = true;
    await maybeMigrateLocalStore(this, this.userId);
  }

  private async insertBundle(seed: SeedBundle, upsert = false): Promise<void> {
    const mode = { onConflict: "id" as const };
    const write = async <T extends object>(table: string, rows: T[], label: string) => {
      if (rows.length === 0) return;
      const q = upsert
        ? this.client.from(table).upsert(rows, mode)
        : this.client.from(table).insert(rows);
      const { error } = await q;
      this.check(error, label);
    };

    await write(
      "recordings",
      seed.recordings.map((r) => ({
        id: r.id,
        user_id: this.userId,
        started_at: r.startedAt,
        duration_sec: r.durationSec,
        mime_type: r.mimeType,
        size_bytes: r.sizeBytes,
        status: r.status,
        transcript_id: r.transcriptId,
      })),
      "bundle recordings"
    );

    await write(
      "transcripts",
      seed.transcripts.map((t) => ({
        id: t.id,
        user_id: this.userId,
        recording_id: t.recordingId,
        text: t.text,
        provider: t.provider,
        created_at: t.createdAt,
      })),
      "bundle transcripts"
    );

    await write(
      "memories",
      seed.memories.map((m) => this.mapMemoryRow(m)),
      "bundle memories"
    );

    await write(
      "memory_relationships",
      seed.relationships.map((r) => ({
        id: r.id,
        user_id: this.userId,
        from_memory_id: r.fromId,
        to_memory_id: r.toId,
        kind: r.kind,
        shared_topics: r.sharedTopics || [],
        created_at: r.createdAt,
      })),
      "bundle relationships"
    );

    await write(
      "action_items",
      seed.actionItems.map((a) => ({
        id: a.id,
        user_id: this.userId,
        memory_id: a.memoryId,
        title: a.title,
        detail: a.detail,
        due_date: normalizeDateOrNull(a.dueDate),
        status: a.status,
        source: a.source,
        source_message_id: a.sourceMessageId ?? null,
        created_at: a.createdAt,
        completed_at: a.completedAt,
        is_demo: !!a.isDemo,
      })),
      "bundle action items"
    );

    await write(
      "goals",
      seed.goals.map((g) => ({
        id: g.id,
        user_id: this.userId,
        title: g.title,
        status: g.status,
        source_memory_id: g.sourceMemoryId,
        created_at: g.createdAt,
        is_demo: !!g.isDemo,
      })),
      "bundle goals"
    );

    if (seed.dailySummaries.length > 0) {
      const { error: sumErr } = await this.client.from("daily_summaries").upsert(
        seed.dailySummaries.map((s) => ({
          id: s.id,
          user_id: this.userId,
          date: s.date,
          summary: s.summary,
          learning_score: s.learningScore,
          metrics: s.metrics,
          created_at: s.createdAt,
          is_demo: !!s.isDemo,
        })),
        { onConflict: "user_id,date" }
      );
      this.check(sumErr, "bundle daily summaries");
    }

    await write(
      "insights",
      seed.insights.map((ins) => ({
        id: ins.id,
        user_id: this.userId,
        kind: ins.kind,
        date: ins.date,
        title: ins.title,
        body: ins.body,
        evidence_ids: ins.evidenceIds || [],
        metrics: ins.metrics || {},
        created_at: ins.createdAt,
        is_demo: !!ins.isDemo,
      })),
      "bundle insights"
    );

    if (seed.conversations && seed.conversations.length > 0) {
      await write(
        "conversations",
        seed.conversations.map((c) => ({
          id: c.id,
          user_id: this.userId,
          title: c.title,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          summary: c.summary,
          is_demo: !!c.isDemo,
        })),
        "bundle conversations"
      );

      await write(
        "conversation_messages",
        (seed.conversationMessages || []).map((m) => ({
          id: m.id,
          user_id: this.userId,
          conversation_id: m.conversationId,
          role: m.role,
          content: m.content,
          citations: m.citations || [],
          proposed_actions: m.proposedActions || [],
          created_at: m.createdAt,
        })),
        "bundle conversation messages"
      );

      await write(
        "conversation_summaries",
        (seed.conversationSummaries || []).map((s) => ({
          id: s.id,
          user_id: this.userId,
          conversation_id: s.conversationId,
          summary: s.summary,
          created_at: s.createdAt,
        })),
        "bundle conversation summaries"
      );

      await write(
        "conversation_memory_refs",
        (seed.conversationMemoryRefs || []).map((r) => ({
          id: r.id,
          user_id: this.userId,
          conversation_id: r.conversationId,
          memory_id: r.memoryId,
          created_at: r.createdAt,
        })),
        "bundle conversation memory refs"
      );
    }
  }

  async upsertMigratedBundle(bundle: MigratedBundleInput): Promise<void> {
    await this.insertBundle(bundle, true);
    if (bundle.profilePatch) {
      await this.updateProfile(bundle.profilePatch);
    }
    await this.syncEntities();
  }

  private buildEntityAggregates(memories: Memory[]): Omit<EntityRecord, "id">[] {
    const map = new Map<string, Omit<EntityRecord, "id">>();
    const add = (kind: EntityRecord["kind"], rawName: string, date: string) => {
      const name = rawName.trim();
      if (!name) return;
      const key = `${kind}:${name.toLowerCase()}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          userId: this.userId,
          kind,
          name,
          mentionCount: 1,
          firstSeen: date,
          lastSeen: date,
        });
      } else {
        existing.mentionCount += 1;
        if (!existing.firstSeen || date < existing.firstSeen) existing.firstSeen = date;
        if (!existing.lastSeen || date > existing.lastSeen) existing.lastSeen = date;
      }
    };
    for (const m of memories) {
      for (const p of m.people) add("person", p, m.date);
      for (const t of m.topics) add("topic", t, m.date);
      for (const e of m.entities) add("entity", e, m.date);
    }
    return [...map.values()];
  }

  private async syncEntities(): Promise<void> {
    const realMemories = await this.allMemories(false);
    const items = this.buildEntityAggregates(realMemories);

    const { data: existing, error: selErr } = await this.client
      .from("entities")
      .select("id,kind,name")
      .eq("user_id", this.userId);
    this.check(selErr, "entities select");

    const wantedKeys = new Set(items.map((it) => `${it.kind}:${it.name}`));
    const staleIds = (existing || [])
      .filter((row) => !wantedKeys.has(`${row.kind}:${row.name}`))
      .map((row) => row.id as string);

    if (staleIds.length > 0) {
      const { error: delErr } = await this.client
        .from("entities")
        .delete()
        .eq("user_id", this.userId)
        .in("id", staleIds);
      this.check(delErr, "entities prune");
    }

    if (items.length > 0) {
      const { error: upErr } = await this.client.from("entities").upsert(
        items.map((it) => ({
          user_id: this.userId,
          kind: it.kind,
          name: it.name,
          mention_count: it.mentionCount,
          first_seen: it.firstSeen,
          last_seen: it.lastSeen,
        })),
        { onConflict: "user_id,kind,name" }
      );
      this.check(upErr, "entities upsert");
    }
  }

  async getProfile(): Promise<Profile> {
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", this.userId)
      .maybeSingle();
    this.check(error, "profile get");

    return {
      id: this.userId,
      name: data?.name || "",
      fullName: data?.full_name || "",
      displayName: data?.display_name || "",
      email: data?.email || this.email || null,
      avatarUrl: data?.avatar_url || null,
      language: data?.language || "English",
      timezone: data?.timezone || "UTC",
      goals: data?.goals || [],
      improveAreas: data?.improve_areas || [],
      onboarded: !!data?.onboarded,
      createdAt: data?.created_at || new Date().toISOString(),
      settings: {
        ...DEFAULT_SETTINGS,
        ...(data?.settings || {}),
        demoMode: data?.settings?.demoMode === true,
      },
    };
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const current = await this.getProfile();
    const map: Record<string, string> = {
      fullName: "full_name",
      displayName: "display_name",
      avatarUrl: "avatar_url",
      improveAreas: "improve_areas",
    };
    const dbPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === "settings" || k === "id" || k === "createdAt" || v === undefined) continue;
      dbPatch[map[k] || k] = v;
    }
    let settings = current.settings;
    if (patch.settings) {
      settings = { ...current.settings, ...patch.settings };
      dbPatch.settings = settings;
    }
    const { error } = await this.client.from("profiles").upsert(
      {
        id: this.userId,
        user_id: this.userId,
        name: current.name,
        ...dbPatch,
      },
      { onConflict: "id" }
    );
    this.check(error, "profile upsert");
    return this.getProfile();
  }

  async resetProfile(): Promise<Profile> {
    await this.wipeAll();
    const { error } = await this.client.from("profiles").delete().eq("id", this.userId);
    this.check(error, "profile delete");
    return {
      id: this.userId,
      name: "",
      fullName: "",
      displayName: "",
      email: this.email,
      avatarUrl: null,
      language: "English",
      timezone: "UTC",
      goals: [],
      improveAreas: [],
      onboarded: false,
      createdAt: new Date().toISOString(),
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  async updateSettings(patch: Partial<Profile["settings"]>): Promise<Profile> {
    const current = await this.getProfile();
    const settings = { ...current.settings, ...patch };
    const { error } = await this.client
      .from("profiles")
      .update({ settings })
      .eq("id", this.userId);
    this.check(error, "settings update");
    return { ...current, settings };
  }

  async addRecording(rec: Recording): Promise<Recording> {
    const row: Recording = { ...rec, userId: this.userId };
    const { error } = await this.client.from("recordings").insert({
      id: row.id,
      user_id: this.userId,
      started_at: row.startedAt,
      duration_sec: row.durationSec,
      mime_type: row.mimeType,
      size_bytes: row.sizeBytes,
      status: row.status,
      transcript_id: row.transcriptId,
    });
    this.check(error, "recording insert");
    return row;
  }

  async addTranscript(tr: Transcript): Promise<Transcript> {
    const row: Transcript = { ...tr, userId: this.userId };
    const { error } = await this.client.from("transcripts").insert({
      id: row.id,
      user_id: this.userId,
      recording_id: row.recordingId,
      text: row.text,
      provider: row.provider,
      created_at: row.createdAt,
    });
    this.check(error, "transcript insert");
    if (row.recordingId) {
      const upd = await this.client
        .from("recordings")
        .update({ transcript_id: row.id })
        .eq("id", row.recordingId)
        .eq("user_id", this.userId);
      this.check(upd.error, "recording link transcript");
    }
    return row;
  }

  async countNonSeedTranscripts(): Promise<number> {
    const { count, error } = await this.client
      .from("transcripts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", this.userId)
      .neq("provider", "seed");
    this.check(error, "transcript count");
    return count || 0;
  }

  async addMemory(m: Memory): Promise<Memory> {
    const row: Memory = { ...m, userId: this.userId };
    const { error } = await this.client.from("memories").insert(this.mapMemoryRow(row));
    this.check(error, "memory insert");
    if (!row.isDemo) {
      await this.syncEntities();
    }
    return row;
  }

  async updateMemory(id: string, patch: Partial<Memory>): Promise<Memory | null> {
    const map: Record<string, string> = {
      followUps: "follow_ups",
      extractionStatus: "extraction_status",
      extractionError: "extraction_error",
      sessionId: "session_id",
      transcriptProvider: "transcript_provider",
      isDemo: "is_demo",
    };
    const dbPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || k === "id" || k === "userId") continue;
      if (k === "tone") dbPatch[map[k] || k] = normalizeTone(v as string | null);
      else if (k === "category") dbPatch[map[k] || k] = normalizeCategory(v as string);
      else dbPatch[map[k] || k] = v;
    }
    const { data, error } = await this.client
      .from("memories")
      .update(dbPatch)
      .eq("id", id)
      .eq("user_id", this.userId)
      .select()
      .maybeSingle();
    this.check(error, "memory update");
    const updated = data ? this.rowToMemory(data as Record<string, unknown>) : null;
    if (
      updated &&
      !updated.isDemo &&
      (patch.topics !== undefined || patch.people !== undefined || patch.entities !== undefined)
    ) {
      await this.syncEntities();
    }
    return updated;
  }

  async deleteMemory(id: string): Promise<void> {
    const r1 = await this.client
      .from("memory_relationships")
      .delete()
      .eq("user_id", this.userId)
      .eq("from_memory_id", id);
    this.check(r1.error, "relationship delete (from)");
    const r2 = await this.client
      .from("memory_relationships")
      .delete()
      .eq("user_id", this.userId)
      .eq("to_memory_id", id);
    this.check(r2.error, "relationship delete (to)");
    const r3 = await this.client
      .from("action_items")
      .update({ memory_id: null })
      .eq("user_id", this.userId)
      .eq("memory_id", id);
    this.check(r3.error, "action unlink");
    const r4 = await this.client
      .from("goals")
      .update({ source_memory_id: null })
      .eq("user_id", this.userId)
      .eq("source_memory_id", id);
    this.check(r4.error, "goal unlink");
    const r5 = await this.client
      .from("memories")
      .delete()
      .eq("user_id", this.userId)
      .eq("id", id);
    this.check(r5.error, "memory delete");
    await this.syncEntities();
  }

  async addRelationships(rels: MemoryRelationship[]): Promise<void> {
    if (rels.length === 0) return;
    const { error } = await this.client.from("memory_relationships").upsert(
      rels.map((r) => ({
        id: r.id,
        user_id: this.userId,
        from_memory_id: r.fromId,
        to_memory_id: r.toId,
        kind: r.kind,
        shared_topics: r.sharedTopics || [],
        created_at: r.createdAt,
      })),
      { onConflict: "id" }
    );
    this.check(error, "relationships upsert");
  }

  private rowToMemory(r: Record<string, unknown>): Memory {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      sessionId: (r.session_id as string) || null,
      createdAt: r.created_at as string,
      date: String(r.date),
      time: String(r.time),
      category: normalizeCategory(r.category as string),
      title: r.title as string,
      summary: (r.summary as string) || "",
      transcript: (r.transcript as string) || "",
      topics: (r.topics as string[]) || [],
      people: (r.people as string[]) || [],
      entities: (r.entities as string[]) || [],
      tone: normalizeTone(r.tone as string | null),
      goals: (r.goals as string[]) || [],
      commitments: (r.commitments as string[]) || [],
      problems: (r.problems as string[]) || [],
      decisions: (r.decisions as string[]) || [],
      followUps: (r.follow_ups as string[]) || [],
      confidence: (r.confidence as number) ?? 0.5,
      source: (r.source as Memory["source"]) || "voice",
      transcriptProvider: (r.transcript_provider as string) || "unknown",
      isDemo: !!r.is_demo,
      extractionStatus: (r.extraction_status as Memory["extractionStatus"]) || "analyzed",
      extractionError: (r.extraction_error as string) || null,
    };
  }

  private async allMemories(demoMode?: boolean): Promise<Memory[]> {
    let q = this.client
      .from("memories")
      .select("*")
      .eq("user_id", this.userId)
      .order("date", { ascending: true })
      .order("time", { ascending: true });
    if (demoMode === false) q = q.eq("is_demo", false);
    const { data, error } = await q;
    this.check(error, "memories list");
    return (data || []).map((r) => this.rowToMemory(r as Record<string, unknown>));
  }

  async listMemories(filter: MemoryFilter = {}): Promise<Memory[]> {
    let out = await this.allMemories(filter.demoMode);
    if (filter.date) out = out.filter((m) => m.date === filter.date);
    if (filter.from) out = out.filter((m) => m.date >= filter.from!);
    if (filter.to) out = out.filter((m) => m.date <= filter.to!);
    if (filter.categories && filter.categories.length > 0) {
      out = out.filter((m) => filter.categories!.includes(m.category));
    }
    if (filter.q) {
      const q = filter.q.toLowerCase();
      out = out.filter((m) =>
        `${m.title} ${m.summary} ${m.transcript} ${m.topics.join(" ")} ${m.people.join(" ")}`
          .toLowerCase()
          .includes(q)
      );
    }
    if (filter.limit) out = out.slice(-filter.limit).reverse();
    return out;
  }

  async getMemory(id: string): Promise<Memory | null> {
    const { data, error } = await this.client
      .from("memories")
      .select("*")
      .eq("user_id", this.userId)
      .eq("id", id)
      .maybeSingle();
    this.check(error, "memory get");
    return data ? this.rowToMemory(data as Record<string, unknown>) : null;
  }

  async getRelationshipsFor(id: string): Promise<MemoryRelationship[]> {
    const { data, error } = await this.client
      .from("memory_relationships")
      .select("*")
      .eq("user_id", this.userId)
      .or(`from_memory_id.eq.${id},to_memory_id.eq.${id}`);
    this.check(error, "relationships get for memory");
    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      fromId: r.from_memory_id,
      toId: r.to_memory_id,
      kind: r.kind,
      sharedTopics: r.shared_topics || [],
      createdAt: r.created_at,
    }));
  }

  async listRelationships(): Promise<MemoryRelationship[]> {
    const { data, error } = await this.client
      .from("memory_relationships")
      .select("*")
      .eq("user_id", this.userId);
    this.check(error, "relationships list");
    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      fromId: r.from_memory_id,
      toId: r.to_memory_id,
      kind: r.kind,
      sharedTopics: r.shared_topics || [],
      createdAt: r.created_at,
    }));
  }

  private rowToAction(r: Record<string, unknown>): ActionItem {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      memoryId: (r.memory_id as string) || null,
      title: r.title as string,
      detail: (r.detail as string) || null,
      dueDate: r.due_date ? String(r.due_date) : null,
      status: r.status as ActionItem["status"],
      source: r.source as ActionItem["source"],
      sourceMessageId: (r.source_message_id as string) || null,
      createdAt: r.created_at as string,
      completedAt: (r.completed_at as string) || null,
      isDemo: !!r.is_demo,
    };
  }

  async listActions(
    filter: { status?: ActionItem["status"][]; demoMode?: boolean } = {}
  ): Promise<ActionItem[]> {
    const { data, error } = await this.client
      .from("action_items")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: true });
    this.check(error, "actions list");
    let out = (data || []).map((r) => this.rowToAction(r as Record<string, unknown>));
    if (filter.status && filter.status.length > 0) {
      out = out.filter((a) => filter.status!.includes(a.status));
    }
    if (filter.demoMode === false) out = out.filter((a) => !a.isDemo);
    out.sort((a, b) => {
      if (a.status === "done" && b.status === "done") {
        return (b.completedAt || "").localeCompare(a.completedAt || "");
      }
      return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    });
    return out;
  }

  async addAction(a: ActionItem): Promise<ActionItem> {
    const row: ActionItem = { ...a, userId: this.userId };
    const { error } = await this.client.from("action_items").insert({
      id: row.id,
      user_id: this.userId,
      memory_id: row.memoryId,
      title: row.title,
      detail: row.detail,
      due_date: normalizeDateOrNull(row.dueDate),
      status: row.status,
      source: row.source,
      source_message_id: row.sourceMessageId ?? null,
      created_at: row.createdAt,
      completed_at: row.completedAt,
      is_demo: !!row.isDemo,
    });
    this.check(error, "action insert");
    return row;
  }

  async updateAction(id: string, patch: Partial<ActionItem>): Promise<ActionItem | null> {
    const map: Record<string, string> = {
      memoryId: "memory_id",
      dueDate: "due_date",
      completedAt: "completed_at",
      sourceMessageId: "source_message_id",
      isDemo: "is_demo",
    };
    const dbPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || k === "id" || k === "userId") continue;
      if (k === "dueDate") dbPatch.due_date = normalizeDateOrNull(v as string | null);
      else dbPatch[map[k] || k] = v;
    }
    const { data, error } = await this.client
      .from("action_items")
      .update(dbPatch)
      .eq("user_id", this.userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    this.check(error, "action update");
    return data ? this.rowToAction(data as Record<string, unknown>) : null;
  }

  async deleteAction(id: string): Promise<void> {
    const { error } = await this.client
      .from("action_items")
      .delete()
      .eq("user_id", this.userId)
      .eq("id", id);
    this.check(error, "action delete");
  }

  private rowToGoal(r: Record<string, unknown>): Goal {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      title: r.title as string,
      status: r.status as Goal["status"],
      sourceMemoryId: (r.source_memory_id as string) || null,
      createdAt: r.created_at as string,
      isDemo: !!r.is_demo,
    };
  }

  async listGoals(demoMode?: boolean): Promise<Goal[]> {
    let q = this.client
      .from("goals")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false });
    if (demoMode === false) q = q.eq("is_demo", false);
    const { data, error } = await q;
    this.check(error, "goals list");
    return (data || []).map((r) => this.rowToGoal(r as Record<string, unknown>));
  }

  async addGoal(g: Goal): Promise<Goal> {
    const row: Goal = { ...g, userId: this.userId };
    const { error } = await this.client.from("goals").upsert(
      {
        id: row.id,
        user_id: this.userId,
        title: row.title,
        status: row.status,
        source_memory_id: row.sourceMemoryId,
        created_at: row.createdAt,
        is_demo: !!row.isDemo,
      },
      { onConflict: "id" }
    );
    this.check(error, "goal insert");
    return row;
  }

  async updateGoal(id: string, patch: Partial<Goal>): Promise<Goal | null> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.sourceMemoryId !== undefined) dbPatch.source_memory_id = patch.sourceMemoryId;
    const { data, error } = await this.client
      .from("goals")
      .update(dbPatch)
      .eq("user_id", this.userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    this.check(error, "goal update");
    return data ? this.rowToGoal(data as Record<string, unknown>) : null;
  }

  async deleteGoal(id: string): Promise<void> {
    const { error } = await this.client
      .from("goals")
      .delete()
      .eq("user_id", this.userId)
      .eq("id", id);
    this.check(error, "goal delete");
  }

  async listEntities(demoMode?: boolean): Promise<EntityRecord[]> {
    const { data, error } = await this.client
      .from("entities")
      .select("*")
      .eq("user_id", this.userId)
      .order("mention_count", { ascending: false });
    this.check(error, "entities list");

    const cloudRows: EntityRecord[] = (data || []).map((r) => ({
      id: String(r.id),
      userId: r.user_id as string,
      kind: r.kind as EntityRecord["kind"],
      name: r.name as string,
      mentionCount: Number(r.mention_count || 1),
      firstSeen: r.first_seen ? String(r.first_seen) : null,
      lastSeen: r.last_seen ? String(r.last_seen) : null,
    }));

    if (demoMode !== true) {
      return cloudRows;
    }

    const demoMems = (await this.allMemories(true)).filter((m) => m.isDemo);
    const merged = new Map<string, EntityRecord>();
    for (const e of cloudRows) {
      merged.set(`${e.kind}:${e.name.toLowerCase()}`, { ...e });
    }
    for (const agg of this.buildEntityAggregates(demoMems)) {
      const key = `${agg.kind}:${agg.name.toLowerCase()}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { id: key, ...agg });
      } else {
        existing.mentionCount += agg.mentionCount;
      }
    }
    return [...merged.values()].sort((a, b) => b.mentionCount - a.mentionCount);
  }

  async listInsights(demoMode?: boolean): Promise<Insight[]> {
    let q = this.client
      .from("insights")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false });
    if (demoMode === false) q = q.eq("is_demo", false);
    const { data, error } = await q;
    this.check(error, "insights list");
    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      date: String(r.date),
      title: r.title,
      body: r.body,
      evidenceIds: r.evidence_ids || [],
      metrics: r.metrics || {},
      createdAt: r.created_at,
      isDemo: !!r.is_demo,
    }));
  }

  async addInsight(i: Insight): Promise<Insight> {
    const row: Insight = { ...i, userId: this.userId };
    const { error } = await this.client.from("insights").insert({
      id: row.id,
      user_id: this.userId,
      kind: row.kind,
      date: row.date,
      title: row.title,
      body: row.body,
      evidence_ids: row.evidenceIds,
      metrics: row.metrics,
      created_at: row.createdAt,
      is_demo: !!row.isDemo,
    });
    this.check(error, "insight insert");
    return row;
  }

  async getDailySummary(date: string): Promise<DailySummary | null> {
    const { data, error } = await this.client
      .from("daily_summaries")
      .select("*")
      .eq("user_id", this.userId)
      .eq("date", date)
      .maybeSingle();
    this.check(error, "daily summary get");
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      date: String(data.date),
      summary: data.summary,
      learningScore: data.learning_score,
      metrics: data.metrics || {},
      createdAt: data.created_at,
      isDemo: !!data.is_demo,
    };
  }

  async upsertDailySummary(s: DailySummary): Promise<DailySummary> {
    const row: DailySummary = { ...s, userId: this.userId };
    const { error } = await this.client.from("daily_summaries").upsert(
      {
        id: row.id,
        user_id: this.userId,
        date: row.date,
        summary: row.summary,
        learning_score: row.learningScore,
        metrics: row.metrics,
        created_at: row.createdAt,
        is_demo: !!row.isDemo,
      },
      { onConflict: "user_id,date" }
    );
    this.check(error, "daily summary upsert");
    return row;
  }

  async listRecordings(date?: string, demoMode?: boolean): Promise<Recording[]> {
    let q = this.client
      .from("recordings")
      .select("*")
      .eq("user_id", this.userId)
      .order("started_at", { ascending: true });
    if (date) q = q.gte("started_at", `${date}T00:00:00`).lte("started_at", `${date}T23:59:59`);
    const { data, error } = await q;
    this.check(error, "recordings list");
    let out = (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      startedAt: r.started_at,
      durationSec: r.duration_sec,
      mimeType: r.mime_type || null,
      sizeBytes: r.size_bytes || null,
      status: r.status,
      transcriptId: r.transcript_id || null,
    }));
    if (demoMode === false) {
      const allMems = await this.allMemories(true);
      const demoSessions = new Set(
        allMems.filter((m) => m.isDemo && m.sessionId).map((m) => m.sessionId as string)
      );
      out = out.filter((r) => !demoSessions.has(r.id));
    }
    return out;
  }

  async deleteTranscripts(): Promise<void> {
    const del = await this.client
      .from("transcripts")
      .delete()
      .eq("user_id", this.userId)
      .neq("provider", "seed");
    this.check(del.error, "transcripts delete");
    const upd = await this.client
      .from("memories")
      .update({ transcript: "" })
      .eq("user_id", this.userId)
      .eq("is_demo", false);
    this.check(upd.error, "transcript clear on memories");
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const profile = await this.getProfile();
    const { data: trRows, error: trErr } = await this.client
      .from("transcripts")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: true });
    this.check(trErr, "transcripts export");

    return {
      exportedAt: new Date().toISOString(),
      profile: { ...profile, id: "[redacted]" },
      memories: await this.allMemories(),
      relationships: await this.listRelationships(),
      entities: await this.listEntities(profile.settings.demoMode),
      recordings: await this.listRecordings(),
      transcripts: trRows || [],
      actionItems: await this.listActions(),
      goals: await this.listGoals(),
      insights: await this.listInsights(),
      conversations: await this.listConversations(),
    };
  }

  async listConversations(demoMode?: boolean): Promise<Conversation[]> {
    let q = this.client.from("conversations").select("*").eq("user_id", this.userId);
    if (demoMode === false) q = q.eq("is_demo", false);
    const { data, error } = await q.order("updated_at", { ascending: false });
    this.check(error, "conversations list");
    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      summary: r.summary || null,
      isDemo: !!r.is_demo,
    }));
  }

  async createConversation(c: Conversation): Promise<Conversation> {
    const row: Conversation = { ...c, userId: this.userId };
    const { error } = await this.client.from("conversations").insert({
      id: row.id,
      user_id: this.userId,
      title: row.title,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      summary: row.summary,
      is_demo: !!row.isDemo,
    });
    this.check(error, "conversation insert");
    return row;
  }

  async renameConversation(id: string, title: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from("conversations")
      .update({ title })
      .eq("user_id", this.userId)
      .eq("id", id)
      .select()
      .maybeSingle();
    this.check(error, "conversation rename");
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      summary: data.summary || null,
      isDemo: !!data.is_demo,
    };
  }

  async getConversation(id: string, demoMode?: boolean): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from("conversations")
      .select("*")
      .eq("user_id", this.userId)
      .eq("id", id)
      .maybeSingle();
    this.check(error, "conversation read");
    if (!data) return null;
    if (demoMode === false && data.is_demo) return null;
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      summary: data.summary || null,
      isDemo: !!data.is_demo,
    };
  }

  async getConversationMessages(id: string, demoMode?: boolean): Promise<ConversationMessage[]> {
    const conv = await this.getConversation(id, demoMode);
    if (!conv) return [];
    const { data, error } = await this.client
      .from("conversation_messages")
      .select("*")
      .eq("user_id", this.userId)
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    this.check(error, "conversation messages list");
    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      conversationId: r.conversation_id,
      role: r.role,
      content: r.content,
      citations: r.citations || [],
      proposedActions: r.proposed_actions || [],
      createdAt: r.created_at,
    }));
  }

  async deleteConversation(id: string): Promise<void> {
    const { error } = await this.client
      .from("conversations")
      .delete()
      .eq("user_id", this.userId)
      .eq("id", id);
    this.check(error, "conversation delete");
  }

  async addConversationMessage(m: ConversationMessage): Promise<ConversationMessage> {
    const row: ConversationMessage = { ...m, userId: this.userId };
    const { error } = await this.client.from("conversation_messages").insert({
      id: row.id,
      user_id: this.userId,
      conversation_id: row.conversationId,
      role: row.role,
      content: row.content,
      citations: row.citations,
      proposed_actions: row.proposedActions,
      created_at: row.createdAt,
    });
    this.check(error, "conversation message insert");
    const upd = await this.client
      .from("conversations")
      .update({ updated_at: row.createdAt })
      .eq("user_id", this.userId)
      .eq("id", row.conversationId);
    this.check(upd.error, "conversation touch");
    return row;
  }

  async getLatestConversationSummary(
    conversationId: string
  ): Promise<ConversationSummaryRecord | null> {
    const { data, error } = await this.client
      .from("conversation_summaries")
      .select("*")
      .eq("user_id", this.userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    this.check(error, "conversation summary read");
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      conversationId: data.conversation_id,
      summary: data.summary,
      createdAt: data.created_at,
    };
  }

  async addConversationSummary(r: ConversationSummaryRecord): Promise<void> {
    const { error } = await this.client.from("conversation_summaries").insert({
      id: r.id,
      user_id: this.userId,
      conversation_id: r.conversationId,
      summary: r.summary,
      created_at: r.createdAt,
    });
    this.check(error, "conversation summary insert");
    const upd = await this.client
      .from("conversations")
      .update({ summary: r.summary })
      .eq("user_id", this.userId)
      .eq("id", r.conversationId);
    this.check(upd.error, "conversation summary denormalize");
  }

  async updateConversationSummary(conversationId: string, summary: string): Promise<void> {
    const upd = await this.client
      .from("conversations")
      .update({ summary })
      .eq("user_id", this.userId)
      .eq("id", conversationId);
    this.check(upd.error, "conversation summary update");
  }

  async addConversationMemoryRefs(refs: Omit<ConversationMemoryRef, "id">[]): Promise<void> {
    if (refs.length === 0) return;
    const conversationId = refs[0].conversationId;
    const existing = await this.listConversationMemoryRefs(conversationId);
    const have = new Set(existing);
    const seen = new Set<string>();
    const fresh = refs.filter(
      (r) => !have.has(r.memoryId) && !seen.has(r.memoryId) && seen.add(r.memoryId)
    );
    if (fresh.length === 0) return;
    const { error } = await this.client.from("conversation_memory_refs").insert(
      fresh.map((r) => ({
        id: `${r.conversationId}:${r.memoryId}`,
        user_id: this.userId,
        conversation_id: r.conversationId,
        memory_id: r.memoryId,
        created_at: r.createdAt,
      }))
    );
    this.check(error, "conversation memory refs insert");
  }

  async listConversationMemoryRefs(conversationId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("conversation_memory_refs")
      .select("memory_id")
      .eq("user_id", this.userId)
      .eq("conversation_id", conversationId);
    this.check(error, "conversation memory refs list");
    return [...new Set((data || []).map((r) => r.memory_id))];
  }

  async countConversationMessages(conversationId: string): Promise<number> {
    const { count, error } = await this.client
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", this.userId)
      .eq("conversation_id", conversationId);
    this.check(error, "conversation message count");
    return count || 0;
  }

  async wipeAll(): Promise<void> {
    const u = this.userId;
    const tables = [
      "conversation_memory_refs",
      "conversation_summaries",
      "conversation_messages",
      "conversations",
      "memory_relationships",
      "transcripts",
      "recordings",
      "action_items",
      "goals",
      "daily_summaries",
      "insights",
      "entities",
      "memories",
    ];
    for (const table of tables) {
      const res = await this.client.from(table).delete().eq("user_id", u);
      this.check(res.error, `wipe ${table}`);
    }
  }

  private async deleteDemoData(): Promise<void> {
    const u = this.userId;
    const demoMemories = (await this.allMemories(true)).filter((m) => m.isDemo);
    const demoIds = demoMemories.map((m) => m.id);
    const demoSessions = [
      ...new Set(demoMemories.filter((m) => m.sessionId).map((m) => m.sessionId as string)),
    ];

    if (demoIds.length > 0) {
      const r1 = await this.client
        .from("memory_relationships")
        .delete()
        .eq("user_id", u)
        .in("from_memory_id", demoIds);
      this.check(r1.error, "demo relationships delete (from)");
      const r2 = await this.client
        .from("memory_relationships")
        .delete()
        .eq("user_id", u)
        .in("to_memory_id", demoIds);
      this.check(r2.error, "demo relationships delete (to)");
    }

    const r3 = await this.client
      .from("transcripts")
      .delete()
      .eq("user_id", u)
      .eq("provider", "seed");
    this.check(r3.error, "demo transcripts delete");

    if (demoSessions.length > 0) {
      const rRec = await this.client
        .from("recordings")
        .delete()
        .eq("user_id", u)
        .in("id", demoSessions);
      this.check(rRec.error, "demo recordings delete");
    }

    if (demoIds.length > 0) {
      const r4 = await this.client
        .from("memories")
        .delete()
        .eq("user_id", u)
        .in("id", demoIds);
      this.check(r4.error, "demo memories delete");
    }

    for (const table of ["action_items", "goals", "daily_summaries", "insights"]) {
      const res = await this.client
        .from(table)
        .delete()
        .eq("user_id", u)
        .eq("is_demo", true);
      this.check(res.error, `demo ${table} delete`);
    }

    const demoConvs = await this.client
      .from("conversations")
      .select("id")
      .eq("user_id", u)
      .eq("is_demo", true);
    this.check(demoConvs.error, "demo conversations select");
    const convIds = (demoConvs.data || []).map((r) => (r as { id: string }).id);
    if (convIds.length > 0) {
      for (const table of [
        "conversation_memory_refs",
        "conversation_summaries",
        "conversation_messages",
      ]) {
        const d = await this.client
          .from(table)
          .delete()
          .eq("user_id", u)
          .in("conversation_id", convIds);
        this.check(d.error, `demo ${table} delete`);
      }
      const d4 = await this.client
        .from("conversations")
        .delete()
        .eq("user_id", u)
        .in("id", convIds);
      this.check(d4.error, "demo conversations delete");
    }
  }

  async clearDemo(): Promise<void> {
    await this.deleteDemoData();
    await this.updateSettings({ demoMode: false });
  }

  async restoreDemo(): Promise<void> {
    await this.deleteDemoData();
    const seed = prefixSeedBundle(buildSeedBundle(), this.userId);
    await this.insertBundle(seed, true);
    await this.updateSettings({ demoMode: true });
  }
}
