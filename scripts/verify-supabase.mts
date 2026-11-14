/* Real-database verification of the Supabase adapter: every write goes over
   HTTP (PostgREST) into a live PostgreSQL instance — no mocks. */
import crypto from "node:crypto";
import http from "node:http";
import { SupabaseStore } from "../src/lib/store/supabase";
import type { Memory, ActionItem } from "../src/lib/types";

const JWT_SECRET = "echo-verification-secret-0123456789abcdef";

/* supabase-js prefixes /rest/v1 to every path; this PostgREST build serves at /.
   A tiny local proxy rewires the prefix — all traffic still goes over HTTP. */
const proxy = http.createServer((req, res) => {
  const target = req.url?.startsWith("/rest/v1") ? req.url.slice("/rest/v1".length) || "/" : req.url || "/";
  const options: http.RequestOptions = {
    host: "localhost",
    port: 3001,
    path: target,
    method: req.method,
    headers: { ...req.headers, host: "localhost:3001" },
  };
  const upstream = http.request(options, (up) => {
    res.writeHead(up.statusCode || 500, up.headers);
    up.pipe(res);
  });
  req.pipe(upstream);
  upstream.on("error", (e) => {
    res.writeHead(502);
    res.end(String(e));
  });
});
await new Promise<void>((resolve, reject) => {
  proxy.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") resolve();
    else reject(err);
  });
  proxy.listen(3002, () => resolve());
});

const url = "http://localhost:3002";

function b64u(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function serviceRoleToken(): string {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(JSON.stringify({ role: "postgres" }));
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const key = serviceRoleToken();
const store = new SupabaseStore(url, key);

const results: string[] = [];
function pass(name: string, detail: string) {
  results.push(`PASS ${name} — ${detail}`);
}
function fail(name: string, detail: string) {
  results.push(`FAIL ${name} — ${detail}`);
}

async function step(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

const memory: Memory = {
  id: "verify-mem-1",
  userId: "demo-user",
  sessionId: null,
  createdAt: new Date().toISOString(),
  date: new Date().toISOString().slice(0, 10),
  time: "10:00",
  category: "decision",
  title: "Verified against real Postgres",
  summary: "Adapter write test.",
  transcript: "We decided to test the Supabase adapter against a real database today.",
  topics: ["testing"],
  people: ["Sam"],
  entities: [],
  tone: null,
  goals: [],
  commitments: ["re-run the adapter verification suite"],
  problems: [],
  decisions: ["test the Supabase adapter"],
  followUps: [],
  confidence: 0.8,
  source: "voice",
  transcriptProvider: "user-verified",
  isDemo: false,
  extractionStatus: "analyzed",
  extractionError: null,
};

await step("init + auto-seed", async () => {
  await store.init();
  const mems = await store.listMemories();
  const demo = mems.filter((m) => m.isDemo).length;
  if (demo < 40) throw new Error(`expected >=40 demo memories, got ${demo}`);
  return `seeded ${demo} demo memories + relations/actions/goals/summaries/insights`;
});

await step("profile read/update", async () => {
  const p1 = await store.getProfile();
  const updated = await store.updateProfile({ displayName: "Verifier", onboarded: true, goals: ["verify"] });
  const p2 = await store.getProfile();
  if (p2.displayName !== "Verifier" || !p2.onboarded) throw new Error("profile roundtrip mismatch");
  await store.updateProfile({ displayName: p1.displayName, onboarded: p1.onboarded, goals: p1.goals });
  return `get+update+reset roundtrip ok (was onboarded=${p1.onboarded})`;
});

await step("memory insert (real capture shape)", async () => {
  await store.addMemory(memory);
  const got = await store.getMemory(memory.id);
  if (!got) throw new Error("memory not found after insert");
  if (got.transcriptProvider !== "user-verified") throw new Error("transcript_provider lost");
  if (got.extractionStatus !== "analyzed") throw new Error("extraction_status lost");
  return "insert + read back with all V2 fields";
});

await step("memory update (extraction)", async () => {
  const upd = await store.updateMemory(memory.id, { title: "Verified & renamed", extractionStatus: "pending" });
  if (!upd || upd.title !== "Verified & renamed" || upd.extractionStatus !== "pending")
    throw new Error("update mismatch");
  await store.updateMemory(memory.id, { title: memory.title, extractionStatus: "analyzed" });
  return "update returned new row";
});

await step("recording + transcript writes", async () => {
  await store.addRecording({
    id: "verify-rec-1",
    userId: "demo-user",
    startedAt: new Date().toISOString(),
    durationSec: 33,
    mimeType: "audio/webm",
    sizeBytes: 123456,
    status: "saved",
    transcriptId: "verify-tr-1",
  });
  await store.addTranscript({
    id: "verify-tr-1",
    userId: "demo-user",
    recordingId: "verify-rec-1",
    text: "adapter verification transcript",
    provider: "test",
    createdAt: new Date().toISOString(),
  });
  const recs = await store.listRecordings(new Date().toISOString().slice(0, 10));
  if (!recs.some((r) => r.id === "verify-rec-1")) throw new Error("recording not listed for today");
  return `recording roundtrip ok (${recs.length} recordings today)`;
});

await step("relationships", async () => {
  const firstDemo = (await store.listMemories({ demoMode: true }))[0];
  await store.addRelationships([
    {
      id: "verify-rel-1",
      userId: "demo-user",
      fromId: memory.id,
      toId: firstDemo.id,
      kind: "related_to",
      sharedTopics: [],
      createdAt: new Date().toISOString(),
    },
  ]);
  const rels = await store.getRelationshipsFor(memory.id);
  if (!rels.some((r) => r.id === "verify-rel-1")) throw new Error("relationship not found");
  return "add + query relationship";
});

await step("action items", async () => {
  const action: ActionItem = {
    id: "verify-act-1",
    userId: "demo-user",
    memoryId: memory.id,
    title: "Verification action",
    detail: null,
    dueDate: null,
    status: "suggested",
    source: "ai",
    createdAt: new Date().toISOString(),
    completedAt: null,
    isDemo: false,
  };
  await store.addAction(action);
  const upd = await store.updateAction(action.id, { status: "done", completedAt: new Date().toISOString() });
  if (!upd || upd.status !== "done") throw new Error("action update failed");
  const list = await store.listActions({ demoMode: false });
  if (!list.some((a) => a.id === action.id)) throw new Error("action missing in real-mode list");
  return "add + update + list";
});

await step("daily summary + insights", async () => {
  await store.upsertDailySummary({
    id: `sum_verify_${new Date().toISOString().slice(0, 10)}`,
    userId: "demo-user",
    date: new Date().toISOString().slice(0, 10),
    summary: "Adapter verification day",
    learningScore: 70,
    metrics: { memories: 1 },
    createdAt: new Date().toISOString(),
    isDemo: false,
  });
  const got = await store.getDailySummary(new Date().toISOString().slice(0, 10));
  if (!got || got.learningScore !== 70) throw new Error("summary roundtrip failed");
  await store.addInsight({
    id: "verify-ins-1",
    userId: "demo-user",
    kind: "daily",
    date: new Date().toISOString().slice(0, 10),
    title: "Verifier insight",
    body: "body",
    evidenceIds: [memory.id],
    metrics: {},
    createdAt: new Date().toISOString(),
    isDemo: false,
  });
  const ins = await store.listInsights(false);
  if (!ins.some((i) => i.id === "verify-ins-1")) throw new Error("insight missing in real-mode list");
  return "summary + insight roundtrip";
});

await step("demo/real separation", async () => {
  await store.updateSettings({ demoMode: false });
  const realOnly = await store.listMemories({ demoMode: false });
  if (realOnly.some((m) => m.isDemo)) throw new Error("demo leaked into real-only list");
  if (realOnly.length < 1) throw new Error("real memory missing");
  await store.updateSettings({ demoMode: true });
  const all = await store.listMemories();
  if (all.length < 41) throw new Error("demo data missing after re-enable");
  return `real-only=${realOnly.length}, full=${all.length}`;
});

await step("deleteMemory cleans graph + unlinks", async () => {
  await store.deleteMemory(memory.id);
  const got = await store.getMemory(memory.id);
  if (got) throw new Error("memory still present after delete");
  const rels = await store.getRelationshipsFor(memory.id);
  if (rels.length !== 0) throw new Error("relationships orphaned after delete");
  const actions = await store.listActions();
  const linked = actions.filter((a) => a.memoryId === memory.id);
  if (linked.length !== 0) throw new Error("actions still linked after delete");
  return "memory + relations removed, actions unlinked";
});

await step("clearDemo preserves real data", async () => {
  await store.addAction({
    id: "verify-act-keep",
    userId: "demo-user",
    memoryId: null,
    title: "Keep me",
    detail: null,
    dueDate: null,
    status: "open",
    source: "user",
    createdAt: new Date().toISOString(),
    completedAt: null,
    isDemo: false,
  });
  await store.addMemory({ ...memory, id: "verify-mem-keep" });
  await store.clearDemo();
  const after = await store.listMemories();
  if (after.some((m) => m.isDemo)) throw new Error("demo survived clearDemo");
  if (!after.some((m) => m.id === "verify-mem-keep")) throw new Error("real memory lost in clearDemo");
  const acts = await store.listActions();
  if (!acts.some((a) => a.id === "verify-act-keep")) throw new Error("real action lost");
  if (acts.some((a) => a.isDemo)) throw new Error("demo action survived");
  return `real-only after clear: ${after.length} memories, ${acts.length} actions`;
});

await step("restoreDemo re-seeds demo data", async () => {
  await store.restoreDemo();
  const all = await store.listMemories();
  const demo = all.filter((m) => m.isDemo).length;
  if (demo < 40) throw new Error(`restoreDemo seeded only ${demo}`);
  if (!all.some((m) => m.id === "verify-mem-keep")) throw new Error("real memory lost in restoreDemo");
  const convs = await store.listConversations();
  if (!convs.some((c) => c.id === "dc-seed-1")) throw new Error("demo conversation missing after restore");
  return `demo restored (${demo}), real data preserved`;
});

await step("conversations CRUD + messages", async () => {
  const now = new Date().toISOString();
  const conv = {
    id: "verify-conv-1",
    userId: "demo-user",
    title: "Adapter verification chat",
    createdAt: now,
    updatedAt: now,
    summary: null,
    isDemo: false,
  };
  await store.createConversation(conv);
  await store.addConversationMessage({
    id: "verify-cmsg-1",
    userId: "demo-user",
    conversationId: conv.id,
    role: "user",
    content: "What did I decide today?",
    citations: [],
    proposedActions: [],
    createdAt: now,
  });
  await store.addConversationMessage({
    id: "verify-cmsg-2",
    userId: "demo-user",
    conversationId: conv.id,
    role: "assistant",
    content: "You decided to test the adapter [1].",
    citations: [{ memoryId: "verify-mem-keep", title: "Verified against real Postgres", date: now.slice(0, 10), time: "10:00" }],
    proposedActions: [{ id: "verify-pa-1", title: "Re-run verification", dueDate: null, added: false }],
    createdAt: new Date(Date.parse(now) + 1000).toISOString(),
  });
  const msgs = await store.getConversationMessages(conv.id);
  if (msgs.length !== 2) throw new Error(`expected 2 messages, got ${msgs.length}`);
  if (msgs[1].citations[0]?.memoryId !== "verify-mem-keep") throw new Error("citations lost");
  if (msgs[1].proposedActions[0]?.title !== "Re-run verification") throw new Error("proposed actions lost");
  await store.addConversationSummary({
    id: "verify-csum-1",
    userId: "demo-user",
    conversationId: conv.id,
    summary: "Discussed adapter verification.",
    createdAt: now,
  });
  const latest = await store.getLatestConversationSummary(conv.id);
  if (!latest || !latest.summary.includes("adapter verification")) throw new Error("summary roundtrip failed");
  await store.addConversationMemoryRefs([
    { userId: "demo-user", conversationId: conv.id, memoryId: "verify-mem-keep", createdAt: now },
    { userId: "demo-user", conversationId: conv.id, memoryId: "verify-mem-keep", createdAt: now },
  ]);
  const refs = await store.listConversationMemoryRefs(conv.id);
  if (refs.length !== 1 || refs[0] !== "verify-mem-keep") throw new Error(`memory refs dedupe failed: ${refs.length}`);
  await store.renameConversation(conv.id, "Renamed chat");
  const renamed = await store.getConversation(conv.id);
  if (renamed?.title !== "Renamed chat") throw new Error("rename failed");
  const listed = await store.listConversations();
  if (!listed.some((c) => c.id === conv.id)) throw new Error("conversation missing in list");
  await store.deleteConversation(conv.id);
  const after = await store.getConversationMessages(conv.id);
  if (after.length !== 0) throw new Error("messages orphaned after conversation delete");
  return "create → messages → summary → refs → rename → list → delete (cascade)";
});

await step("conversation demo/real separation", async () => {
  const now = new Date().toISOString();
  await store.createConversation({
    id: "verify-conv-keep",
    userId: "demo-user",
    title: "Real chat kept for clearDemo check",
    createdAt: now,
    updatedAt: now,
    summary: null,
    isDemo: false,
  });
  const demoConv = {
    id: "verify-conv-demo",
    userId: "demo-user",
    title: "Demo chat",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: null,
    isDemo: true,
  };
  await store.createConversation(demoConv);
  const realOnly = await store.listConversations(false);
  if (realOnly.some((c) => c.isDemo)) throw new Error("demo conversation leaked into real-only list");
  const hidden = await store.getConversation(demoConv.id, false);
  if (hidden !== null) throw new Error("demo conversation readable in real mode");
  const demoMsgs = await store.getConversationMessages(demoConv.id, false);
  if (demoMsgs.length !== 0) throw new Error("demo messages readable in real mode");
  const all = await store.listConversations();
  if (!all.some((c) => c.id === demoConv.id)) throw new Error("demo conversation missing in full list");
  await store.deleteConversation(demoConv.id);
  return "demo conversation hidden in real mode, visible in demo mode";
});

await step("clearDemo preserves real conversations", async () => {
  await store.clearDemo();
  const convs = await store.listConversations();
  if (convs.some((c) => c.isDemo)) throw new Error("demo conversation survived clearDemo");
  if (!convs.some((c) => c.id === "verify-conv-keep")) throw new Error("real conversation lost in clearDemo");
  return `real-only conversations after clear: ${convs.length}`;
});

await step("wipeAll clears everything", async () => {
  await store.wipeAll();
  const mems = await store.listMemories();
  const acts = await store.listActions();
  const convs = await store.listConversations();
  if (mems.length !== 0 || acts.length !== 0 || convs.length !== 0)
    throw new Error(`wipe left ${mems.length} mems, ${acts.length} acts, ${convs.length} convs`);
  return "store empty after wipe";
});

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
