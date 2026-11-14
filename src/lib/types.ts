export const USER_ID = "demo-user";

export type MemoryCategory =
  | "memory"
  | "person"
  | "goal"
  | "decision"
  | "problem"
  | "idea"
  | "learning"
  | "habit";

export const MEMORY_CATEGORIES: Exclude<MemoryCategory, "person">[] = [
  "memory",
  "goal",
  "decision",
  "problem",
  "idea",
  "learning",
  "habit",
];

export type RelKind =
  | "related_to"
  | "caused_by"
  | "followed_by"
  | "contradicts"
  | "supports"
  | "shared_topic";

export const REL_KINDS: RelKind[] = [
  "related_to",
  "caused_by",
  "followed_by",
  "contradicts",
  "supports",
  "shared_topic",
];

export type ExtractionStatus = "analyzed" | "pending" | "failed";

export interface Memory {
  id: string;
  userId: string;
  sessionId: string | null;
  createdAt: string;
  date: string;
  time: string;
  category: MemoryCategory;
  title: string;
  summary: string;
  transcript: string;
  topics: string[];
  people: string[];
  entities: string[];
  tone: string | null;
  goals: string[];
  commitments: string[];
  problems: string[];
  decisions: string[];
  followUps: string[];
  confidence: number;
  source: "voice" | "text" | "seed";
  transcriptProvider: string;
  isDemo: boolean;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
}

export interface MemoryRelationship {
  id: string;
  userId: string;
  fromId: string;
  toId: string;
  kind: RelKind;
  sharedTopics: string[];
  createdAt: string;
}

export interface Recording {
  id: string;
  userId: string;
  startedAt: string;
  durationSec: number;
  mimeType: string | null;
  sizeBytes: number | null;
  status: "saved" | "processing" | "failed";
  transcriptId: string | null;
}

export interface Transcript {
  id: string;
  userId: string;
  recordingId: string | null;
  text: string;
  provider: string;
  createdAt: string;
}

export type ActionStatus = "suggested" | "open" | "done" | "dismissed";

export interface ActionItem {
  id: string;
  userId: string;
  memoryId: string | null;
  title: string;
  detail: string | null;
  dueDate: string | null;
  status: ActionStatus;
  source: "ai" | "memory" | "user";
  sourceMessageId?: string | null;
  createdAt: string;
  completedAt: string | null;
  isDemo: boolean;
}

export interface Insight {
  id: string;
  userId: string;
  kind: "daily" | "weekly" | "pattern";
  date: string;
  title: string;
  body: string;
  evidenceIds: string[];
  metrics: Record<string, string | number>;
  createdAt: string;
  isDemo: boolean;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  status: "active" | "done" | "dropped";
  sourceMemoryId: string | null;
  createdAt: string;
  isDemo: boolean;
}

export interface DailySummary {
  id: string;
  userId: string;
  date: string;
  summary: string;
  learningScore: number;
  metrics: Record<string, number>;
  createdAt: string;
  isDemo: boolean;
}

export interface EntityRecord {
  id: string;
  userId: string;
  kind: "person" | "topic" | "entity";
  name: string;
  mentionCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface ProfileSettings {
  keepTranscripts: boolean;
  keepAudio: boolean;
  demoMode: boolean;
}

export interface Profile {
  id: string;
  name: string;
  fullName: string;
  displayName: string;
  email: string | null;
  avatarUrl?: string | null;
  language: string;
  timezone: string;
  goals: string[];
  improveAreas: string[];
  onboarded: boolean;
  createdAt: string;
  settings: ProfileSettings;
}

export interface MemoryFilter {
  from?: string;
  to?: string;
  date?: string;
  categories?: string[];
  q?: string;
  limit?: number;
  demoMode?: boolean;
}

export interface RelatedLink {
  rel: MemoryRelationship;
  memory: Memory;
}

export interface GraphNode {
  id: string;
  kind: "memory" | "person" | "topic";
  label: string;
  category?: MemoryCategory;
  date?: string;
  time?: string;
  weight: number;
  memoryIds: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: RelKind;
  sharedTopics: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    memoryCount: number;
    hubCount: number;
    edgeCount: number;
    topicCounts: { topic: string; count: number }[];
    peopleCounts: { person: string; count: number }[];
  };
}

export interface CapturePayload {
  title: string;
  summary: string;
  category: MemoryCategory;
  topics: string[];
  people: string[];
  entities: string[];
  tone: string | null;
  goals: string[];
  commitments: string[];
  problems: string[];
  decisions: string[];
  followUps: string[];
  confidence: number;
}

export interface CaptureResult {
  memory: Memory;
  extracted: Memory[];
  suggestedActions: ActionItem[];
  status: ExtractionStatus;
  message: string;
  warnings: string[];
  transcriptProvider: string;
}

export interface OnboardingPayload {
  fullName?: string;
  displayName?: string;
  email?: string | null;
  goals?: string[];
  improveAreas?: string[];
  language?: string;
  timezone?: string;
  demoMode?: boolean;
}

export interface StoreFlags {
  gemini: boolean;
  supabase: boolean;
  storeMode: "supabase" | "local";
  model: string;
}

export interface StoreStats {
  totalMemories: number;
  demoCount: number;
  todayMemories: number;
  todayCaptureSec: number;
  importantToday: number;
  openActions: number;
  overdueActions: number;
  suggestedActions: number;
  daysCovered: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface CitationRef {
  memoryId: string;
  title: string;
  date: string;
  time: string;
}

export interface ProposedAction {
  id: string;
  title: string;
  dueDate: string | null;
  added: boolean;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  isDemo: boolean;
}

export interface ConversationMessage {
  id: string;
  userId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: CitationRef[];
  proposedActions: ProposedAction[];
  createdAt: string;
}

export interface ConversationSummaryRecord {
  id: string;
  userId: string;
  conversationId: string;
  summary: string;
  createdAt: string;
}

export interface ConversationMemoryRef {
  id: string;
  userId: string;
  conversationId: string;
  memoryId: string;
  createdAt: string;
}
