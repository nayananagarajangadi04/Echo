import fs from "fs";
import path from "path";
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
  MemoryRelationship,
  MemoryFilter,
  Profile,
  Recording,
  Transcript,
} from "../types";
import { USER_ID } from "../types";
import { buildSeedBundle } from "../seed-data";
import { dedupe, uid } from "../util";
import type { DomainStore } from "./index";

interface StoreFile {
  version: number;
  profile: Profile;
  memories: Memory[];
  relationships: MemoryRelationship[];
  recordings: Recording[];
  transcripts: Transcript[];
  actionItems: ActionItem[];
  insights: Insight[];
  goals: Goal[];
  dailySummaries: DailySummary[];
  conversations: Conversation[];
  conversationMessages: ConversationMessage[];
  conversationSummaries: ConversationSummaryRecord[];
  conversationMemoryRefs: ConversationMemoryRef[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "echo-store.json");

export function defaultProfile(): Profile {
  return {
    id: USER_ID,
    name: "",
    fullName: "",
    displayName: "",
    email: null,
    avatarUrl: null,
    language: "English",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    goals: [],
    improveAreas: [],
    onboarded: false,
    createdAt: new Date().toISOString(),
    settings: { keepTranscripts: true, keepAudio: false, demoMode: true },
  };
}

function applySeed(data: StoreFile): void {
  const seed = buildSeedBundle();
  data.memories.push(...seed.memories);
  data.relationships.push(...seed.relationships);
  data.recordings.push(...seed.recordings);
  data.transcripts.push(...seed.transcripts);
  data.actionItems.push(...seed.actionItems);
  data.goals.push(...seed.goals);
  data.dailySummaries.push(...seed.dailySummaries);
  data.insights.push(...seed.insights);
  if (seed.conversations) {
    data.conversations.push(...seed.conversations);
    data.conversationMessages.push(...(seed.conversationMessages || []));
    data.conversationSummaries.push(...(seed.conversationSummaries || []));
    data.conversationMemoryRefs.push(...(seed.conversationMemoryRefs || []));
  }
}

function emptyConversationSections(): Pick<
  StoreFile,
  "conversations" | "conversationMessages" | "conversationSummaries" | "conversationMemoryRefs"
> {
  return {
    conversations: [],
    conversationMessages: [],
    conversationSummaries: [],
    conversationMemoryRefs: [],
  };
}

function seedFile(): StoreFile {
  const data: StoreFile = {
    version: 2,
    profile: defaultProfile(),
    memories: [],
    relationships: [],
    recordings: [],
    transcripts: [],
    actionItems: [],
    insights: [],
    goals: [],
    dailySummaries: [],
    ...emptyConversationSections(),
  };
  applySeed(data);
  return data;
}

export class LocalStore implements DomainStore {
  readonly userId = USER_ID;
  private data: StoreFile = seedFile();

  async init(): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    let loaded: StoreFile | null = null;
    try {
      loaded = JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreFile;
    } catch {
      loaded = null;
    }
    if (loaded && Array.isArray(loaded.memories)) {
      this.data = loaded;
      if (!this.data.profile) this.data.profile = defaultProfile();
      this.data.profile.settings = {
        ...defaultProfile().settings,
        ...this.data.profile.settings,
      };
      this.data.memories = this.data.memories.map((m) => ({
        ...m,
        extractionStatus: m.extractionStatus || "analyzed",
        extractionError: m.extractionError || null,
      }));
      this.data = { ...emptyConversationSections(), ...this.data };
    } else {
      this.data = seedFile();
      this.persist();
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(FILE, JSON.stringify(this.data), "utf8");
    } catch {
      // persistence failure is non-fatal for a read path
    }
  }

  async getProfile(): Promise<Profile> {
    return this.data.profile;
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const { settings, ...rest } = patch;
    this.data.profile = { ...this.data.profile, ...rest };
    if (settings) {
      this.data.profile.settings = { ...this.data.profile.settings, ...settings };
    }
    this.persist();
    return this.data.profile;
  }

  async resetProfile(): Promise<Profile> {
    const fresh = defaultProfile();
    this.data.profile = fresh;
    this.data.memories = [];
    this.data.relationships = [];
    this.data.recordings = [];
    this.data.transcripts = [];
    this.data.actionItems = [];
    this.data.goals = [];
    this.data.dailySummaries = [];
    this.data.insights = [];
    Object.assign(this.data, emptyConversationSections());
    this.persist();
    return fresh;
  }

  async updateSettings(patch: Partial<Profile["settings"]>): Promise<Profile> {
    this.data.profile.settings = { ...this.data.profile.settings, ...patch };
    this.persist();
    return this.data.profile;
  }

  async addRecording(rec: Recording): Promise<Recording> {
    this.data.recordings.push(rec);
    this.persist();
    return rec;
  }

  async addTranscript(tr: Transcript): Promise<Transcript> {
    this.data.transcripts.push(tr);
    const rec = this.data.recordings.find((r) => r.id === tr.recordingId);
    if (rec) rec.transcriptId = tr.id;
    this.persist();
    return tr;
  }

  async addMemory(m: Memory): Promise<Memory> {
    this.data.memories.push(m);
    this.persist();
    return m;
  }

  async updateMemory(id: string, patch: Partial<Memory>): Promise<Memory | null> {
    const idx = this.data.memories.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.data.memories[idx] = { ...this.data.memories[idx], ...patch };
    this.persist();
    return this.data.memories[idx];
  }

  async deleteMemory(id: string): Promise<void> {
    this.data.memories = this.data.memories.filter((m) => m.id !== id);
    this.data.relationships = this.data.relationships.filter(
      (r) => r.fromId !== id && r.toId !== id
    );
    this.data.actionItems = this.data.actionItems.map((a) =>
      a.memoryId === id ? { ...a, memoryId: null } : a
    );
    this.data.goals = this.data.goals.map((g) =>
      g.sourceMemoryId === id ? { ...g, sourceMemoryId: null } : g
    );
    this.persist();
  }

  async addRelationships(rels: MemoryRelationship[]): Promise<void> {
    if (rels.length === 0) return;
    this.data.relationships.push(...rels);
    this.persist();
  }

  async listMemories(filter: MemoryFilter = {}): Promise<Memory[]> {
    let out = [...this.data.memories];
    if (filter.date) out = out.filter((m) => m.date === filter.date);
    if (filter.from) out = out.filter((m) => m.date >= filter.from!);
    if (filter.to) out = out.filter((m) => m.date <= filter.to!);
    if (filter.categories && filter.categories.length > 0) {
      out = out.filter((m) => filter.categories!.includes(m.category));
    }
    if (filter.demoMode === false) out = out.filter((m) => !m.isDemo);
    if (filter.q) {
      const q = filter.q.toLowerCase();
      out = out.filter((m) =>
        `${m.title} ${m.summary} ${m.transcript} ${m.topics.join(" ")} ${m.people.join(" ")}`
          .toLowerCase()
          .includes(q)
      );
    }
    out.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
    if (filter.limit) out = out.slice(-filter.limit).reverse();
    return out;
  }

  async getMemory(id: string): Promise<Memory | null> {
    return this.data.memories.find((m) => m.id === id) || null;
  }

  async getRelationshipsFor(id: string): Promise<MemoryRelationship[]> {
    return this.data.relationships.filter((r) => r.fromId === id || r.toId === id);
  }

  async listRelationships(): Promise<MemoryRelationship[]> {
    return [...this.data.relationships];
  }

  async listActions(filter: { status?: ActionItem["status"][]; demoMode?: boolean } = {}): Promise<ActionItem[]> {
    let out = [...this.data.actionItems];
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
    this.data.actionItems.push(a);
    this.persist();
    return a;
  }

  async updateAction(id: string, patch: Partial<ActionItem>): Promise<ActionItem | null> {
    const idx = this.data.actionItems.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    this.data.actionItems[idx] = { ...this.data.actionItems[idx], ...patch };
    this.persist();
    return this.data.actionItems[idx];
  }

  async deleteAction(id: string): Promise<void> {
    this.data.actionItems = this.data.actionItems.filter((a) => a.id !== id);
    this.persist();
  }

  async listGoals(demoMode?: boolean): Promise<Goal[]> {
    let out = [...this.data.goals];
    if (demoMode === false) out = out.filter((g) => !g.isDemo);
    return out;
  }

  async addGoal(g: Goal): Promise<Goal> {
    this.data.goals.push(g);
    this.persist();
    return g;
  }

  async updateGoal(id: string, patch: Partial<Goal>): Promise<Goal | null> {
    const idx = this.data.goals.findIndex((g) => g.id === id);
    if (idx === -1) return null;
    this.data.goals[idx] = { ...this.data.goals[idx], ...patch };
    this.persist();
    return this.data.goals[idx];
  }

  async deleteGoal(id: string): Promise<void> {
    this.data.goals = this.data.goals.filter((g) => g.id !== id);
    this.persist();
  }

  async listEntities(demoMode?: boolean): Promise<EntityRecord[]> {
    const map = new Map<string, EntityRecord>();
    const mems = demoMode === false ? this.data.memories.filter((m) => !m.isDemo) : this.data.memories;
    const add = (kind: EntityRecord["kind"], name: string, date: string) => {
      const clean = name.trim();
      if (!clean) return;
      const key = `${kind}:${clean.toLowerCase()}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          id: key,
          userId: this.userId,
          kind,
          name: clean,
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
    for (const m of mems) {
      for (const p of m.people) add("person", p, m.date);
      for (const t of m.topics) add("topic", t, m.date);
      for (const e of m.entities) add("entity", e, m.date);
    }
    return [...map.values()].sort((a, b) => b.mentionCount - a.mentionCount);
  }

  async listInsights(demoMode?: boolean): Promise<Insight[]> {
    let out = [...this.data.insights];
    if (demoMode === false) out = out.filter((i) => !i.isDemo);
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addInsight(i: Insight): Promise<Insight> {
    this.data.insights.push(i);
    this.persist();
    return i;
  }

  async getDailySummary(date: string): Promise<DailySummary | null> {
    return this.data.dailySummaries.find((s) => s.date === date) || null;
  }

  async upsertDailySummary(s: DailySummary): Promise<DailySummary> {
    const idx = this.data.dailySummaries.findIndex((x) => x.date === s.date);
    if (idx === -1) this.data.dailySummaries.push(s);
    else this.data.dailySummaries[idx] = s;
    this.persist();
    return s;
  }

  async listRecordings(date?: string, demoMode?: boolean): Promise<Recording[]> {
    let out = [...this.data.recordings];
    if (date) out = out.filter((r) => r.startedAt.slice(0, 10) === date);
    if (demoMode === false) {
      const demoSessionIds = new Set(
        this.data.memories.filter((m) => m.isDemo).map((m) => m.sessionId)
      );
      out = out.filter((r) => !demoSessionIds.has(r.id));
    }
    return out;
  }

  async deleteTranscripts(): Promise<void> {
    this.data.transcripts = this.data.transcripts.filter((t) => t.provider === "seed");
    this.data.memories = this.data.memories.map((m) =>
      m.isDemo ? m : { ...m, transcript: "" }
    );
    this.persist();
  }

  async listConversations(demoMode?: boolean): Promise<Conversation[]> {
    let out = [...this.data.conversations];
    if (demoMode === false) out = out.filter((c) => !c.isDemo);
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createConversation(c: Conversation): Promise<Conversation> {
    this.data.conversations.push(c);
    this.persist();
    return c;
  }

  async renameConversation(id: string, title: string): Promise<Conversation | null> {
    const conv = this.data.conversations.find((c) => c.id === id);
    if (!conv) return null;
    conv.title = title;
    this.persist();
    return conv;
  }

  async getConversation(id: string, demoMode?: boolean): Promise<Conversation | null> {
    const conv = this.data.conversations.find((c) => c.id === id) || null;
    if (!conv) return null;
    if (demoMode === false && conv.isDemo) return null;
    return conv;
  }

  async getConversationMessages(id: string, demoMode?: boolean): Promise<ConversationMessage[]> {
    const conv = await this.getConversation(id, demoMode);
    if (!conv) return [];
    return this.data.conversationMessages
      .filter((m) => m.conversationId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async deleteConversation(id: string): Promise<void> {
    this.data.conversations = this.data.conversations.filter((c) => c.id !== id);
    this.data.conversationMessages = this.data.conversationMessages.filter(
      (m) => m.conversationId !== id
    );
    this.data.conversationSummaries = this.data.conversationSummaries.filter(
      (s) => s.conversationId !== id
    );
    this.data.conversationMemoryRefs = this.data.conversationMemoryRefs.filter(
      (r) => r.conversationId !== id
    );
    this.persist();
  }

  async addConversationMessage(m: ConversationMessage): Promise<ConversationMessage> {
    this.data.conversationMessages.push(m);
    const conv = this.data.conversations.find((c) => c.id === m.conversationId);
    if (conv) conv.updatedAt = m.createdAt;
    this.persist();
    return m;
  }

  async getLatestConversationSummary(
    conversationId: string
  ): Promise<ConversationSummaryRecord | null> {
    const rows = this.data.conversationSummaries
      .filter((s) => s.conversationId === conversationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0] || null;
  }

  async addConversationSummary(r: ConversationSummaryRecord): Promise<void> {
    this.data.conversationSummaries.push(r);
    const conv = this.data.conversations.find((c) => c.id === r.conversationId);
    if (conv) conv.summary = r.summary;
    this.persist();
  }

  async updateConversationSummary(conversationId: string, summary: string): Promise<void> {
    const conv = this.data.conversations.find((c) => c.id === conversationId);
    if (conv) conv.summary = summary;
    this.persist();
  }

  async addConversationMemoryRefs(
    refs: Omit<ConversationMemoryRef, "id">[]
  ): Promise<void> {
    if (refs.length === 0) return;
    const existing = new Set(
      this.data.conversationMemoryRefs
        .filter((r) => r.conversationId === refs[0].conversationId)
        .map((r) => r.memoryId)
    );
    const seen = new Set<string>();
    const fresh = refs.filter((r) => !existing.has(r.memoryId) && !seen.has(r.memoryId) && seen.add(r.memoryId));
    if (fresh.length === 0) return;
    this.data.conversationMemoryRefs.push(...fresh.map((r) => ({ ...r, id: uid("cmr") })));
    this.persist();
  }

  async listConversationMemoryRefs(conversationId: string): Promise<string[]> {
    return dedupe(
      this.data.conversationMemoryRefs
        .filter((r) => r.conversationId === conversationId)
        .map((r) => r.memoryId)
    );
  }

  async countConversationMessages(conversationId: string): Promise<number> {
    return this.data.conversationMessages.filter((m) => m.conversationId === conversationId).length;
  }

  async exportAll(): Promise<Record<string, unknown>> {
    return {
      exportedAt: new Date().toISOString(),
      profile: { ...this.data.profile, id: "[redacted]" },
      memories: this.data.memories,
      relationships: this.data.relationships,
      recordings: this.data.recordings,
      transcripts: this.data.transcripts,
      actionItems: this.data.actionItems,
      insights: this.data.insights,
      goals: this.data.goals,
      dailySummaries: this.data.dailySummaries,
    };
  }

  async wipeAll(): Promise<void> {
    this.data.memories = [];
    this.data.relationships = [];
    this.data.recordings = [];
    this.data.transcripts = [];
    this.data.actionItems = [];
    this.data.goals = [];
    this.data.dailySummaries = [];
    this.data.insights = [];
    Object.assign(this.data, emptyConversationSections());
    this.persist();
  }

  async clearDemo(): Promise<void> {
    const demoMems = new Set(this.data.memories.filter((m) => m.isDemo).map((m) => m.id));
    const demoSessions = new Set(
      this.data.memories.filter((m) => m.isDemo && m.sessionId).map((m) => m.sessionId)
    );
    this.data.memories = this.data.memories.filter((m) => !m.isDemo);
    this.data.relationships = this.data.relationships.filter(
      (r) => !demoMems.has(r.fromId) && !demoMems.has(r.toId)
    );
    this.data.recordings = this.data.recordings.filter((r) => !demoSessions.has(r.id));
    this.data.transcripts = this.data.transcripts.filter(
      (t) => t.provider !== "seed" && !(t.recordingId && demoSessions.has(t.recordingId))
    );
    this.data.actionItems = this.data.actionItems.filter((a) => !a.isDemo);
    this.data.goals = this.data.goals.filter((g) => !g.isDemo);
    this.data.dailySummaries = this.data.dailySummaries.filter((s) => !s.isDemo);
    this.data.insights = this.data.insights.filter((i) => !i.isDemo);
    const demoConvIds = new Set(
      this.data.conversations.filter((c) => c.isDemo).map((c) => c.id)
    );
    this.data.conversations = this.data.conversations.filter((c) => !c.isDemo);
    this.data.conversationMessages = this.data.conversationMessages.filter(
      (m) => !demoConvIds.has(m.conversationId)
    );
    this.data.conversationSummaries = this.data.conversationSummaries.filter(
      (s) => !demoConvIds.has(s.conversationId)
    );
    this.data.conversationMemoryRefs = this.data.conversationMemoryRefs.filter(
      (r) => !demoConvIds.has(r.conversationId)
    );
    this.data.profile.settings = { ...this.data.profile.settings, demoMode: false };
    this.persist();
  }

  async restoreDemo(): Promise<void> {
    const demoMems = new Set(this.data.memories.filter((m) => m.isDemo).map((m) => m.id));
    const demoSessions = new Set(
      this.data.memories.filter((m) => m.isDemo && m.sessionId).map((m) => m.sessionId)
    );
    this.data.memories = this.data.memories.filter((m) => !m.isDemo);
    this.data.relationships = this.data.relationships.filter(
      (r) => !demoMems.has(r.fromId) && !demoMems.has(r.toId)
    );
    this.data.recordings = this.data.recordings.filter((r) => !demoSessions.has(r.id));
    this.data.transcripts = this.data.transcripts.filter(
      (t) => t.provider !== "seed" && !(t.recordingId && demoSessions.has(t.recordingId))
    );
    this.data.actionItems = this.data.actionItems.filter((a) => !a.isDemo);
    this.data.goals = this.data.goals.filter((g) => !g.isDemo);
    this.data.dailySummaries = this.data.dailySummaries.filter((s) => !s.isDemo);
    this.data.insights = this.data.insights.filter((i) => !i.isDemo);
    const demoConvIds2 = new Set(
      this.data.conversations.filter((c) => c.isDemo).map((c) => c.id)
    );
    this.data.conversations = this.data.conversations.filter((c) => !c.isDemo);
    this.data.conversationMessages = this.data.conversationMessages.filter(
      (m) => !demoConvIds2.has(m.conversationId)
    );
    this.data.conversationSummaries = this.data.conversationSummaries.filter(
      (s) => !demoConvIds2.has(s.conversationId)
    );
    this.data.conversationMemoryRefs = this.data.conversationMemoryRefs.filter(
      (r) => !demoConvIds2.has(r.conversationId)
    );
    applySeed(this.data);
    this.data.profile.settings = { ...this.data.profile.settings, demoMode: true };
    this.persist();
  }
}
