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
import { getFlags } from "../env";
import { getAuthenticatedUser, UnauthorizedError } from "../supabase/server";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";

export interface DomainStore {
  readonly userId: string;
  init(): Promise<void>;
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;
  resetProfile(): Promise<Profile>;
  updateSettings(patch: Partial<Profile["settings"]>): Promise<Profile>;
  addRecording(rec: Recording): Promise<Recording>;
  addTranscript(tr: Transcript): Promise<Transcript>;
  addMemory(m: Memory): Promise<Memory>;
  updateMemory(id: string, patch: Partial<Memory>): Promise<Memory | null>;
  deleteMemory(id: string): Promise<void>;
  addRelationships(rels: MemoryRelationship[]): Promise<void>;
  listMemories(filter?: MemoryFilter): Promise<Memory[]>;
  getMemory(id: string): Promise<Memory | null>;
  getRelationshipsFor(id: string): Promise<MemoryRelationship[]>;
  listRelationships(): Promise<MemoryRelationship[]>;
  listActions(filter?: { status?: ActionItem["status"][]; demoMode?: boolean }): Promise<ActionItem[]>;
  addAction(a: ActionItem): Promise<ActionItem>;
  updateAction(id: string, patch: Partial<ActionItem>): Promise<ActionItem | null>;
  deleteAction(id: string): Promise<void>;
  listGoals(demoMode?: boolean): Promise<Goal[]>;
  addGoal(g: Goal): Promise<Goal>;
  updateGoal(id: string, patch: Partial<Goal>): Promise<Goal | null>;
  deleteGoal(id: string): Promise<void>;
  listEntities(demoMode?: boolean): Promise<EntityRecord[]>;
  listInsights(demoMode?: boolean): Promise<Insight[]>;
  addInsight(i: Insight): Promise<Insight>;
  getDailySummary(date: string): Promise<DailySummary | null>;
  upsertDailySummary(s: DailySummary): Promise<DailySummary>;
  listRecordings(date?: string, demoMode?: boolean): Promise<Recording[]>;
  deleteTranscripts(): Promise<void>;
  listConversations(demoMode?: boolean): Promise<Conversation[]>;
  createConversation(c: Conversation): Promise<Conversation>;
  renameConversation(id: string, title: string): Promise<Conversation | null>;
  getConversationMessages(id: string, demoMode?: boolean): Promise<ConversationMessage[]>;
  getConversation(id: string, demoMode?: boolean): Promise<Conversation | null>;
  deleteConversation(id: string): Promise<void>;
  addConversationMessage(m: ConversationMessage): Promise<ConversationMessage>;
  getLatestConversationSummary(conversationId: string): Promise<ConversationSummaryRecord | null>;
  addConversationSummary(r: ConversationSummaryRecord): Promise<void>;
  updateConversationSummary(conversationId: string, summary: string): Promise<void>;
  addConversationMemoryRefs(refs: Omit<ConversationMemoryRef, "id">[]): Promise<void>;
  listConversationMemoryRefs(conversationId: string): Promise<string[]>;
  countConversationMessages(conversationId: string): Promise<number>;
  exportAll(): Promise<Record<string, unknown>>;
  wipeAll(): Promise<void>;
  clearDemo(): Promise<void>;
  restoreDemo(): Promise<void>;
}

export function getStorageWarning(): string | null {
  return null;
}

export async function getStore(): Promise<DomainStore> {
  const flags = getFlags();
  let store: DomainStore;
  if (flags.supabase) {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }
    store = new SupabaseStore(supabase, {
      id: user.id,
      email: user.email ?? null,
      userMetadata: (user.user_metadata as Record<string, unknown>) || {},
    });
  } else {
    store = new LocalStore();
  }
  await store.init();
  return store;
}

export async function getScopedStore(): Promise<{
  store: DomainStore;
  profile: Profile;
  demoMode: boolean;
}> {
  const store = await getStore();
  const profile = await store.getProfile();
  const demoMode = profile.settings.demoMode === true;
  return { store, profile, demoMode };
}
