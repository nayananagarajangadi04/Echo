import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE_URL = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
const ROOT = process.cwd();
const LOCAL_STORE_PATH = path.join(ROOT, "data", "echo-store.json");
const MIGRATION_STATE_PATH = path.join(ROOT, "data", "echo-migration-state.json");
const RESTART_CONTEXT_PATH = path.join(ROOT, "data", ".verify-restart-context.json");

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }
  getAll() {
    return [...this.map.entries()].map(([name, value]) => ({ name, value }));
  }
  applySetCookie(name, value, options = {}) {
    if (!value || options.maxAge === 0) {
      this.map.delete(name);
    } else {
      this.map.set(name, value);
    }
  }
  applyResponseHeaders(headers) {
    const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const firstSemi = raw.indexOf(";");
      const nv = (firstSemi === -1 ? raw : raw.slice(0, firstSemi)).trim();
      const eq = nv.indexOf("=");
      if (eq === -1) continue;
      const name = nv.slice(0, eq);
      const value = nv.slice(eq + 1);
      const lower = raw.toLowerCase();
      if (!value || lower.includes("max-age=0")) {
        this.map.delete(name);
      } else {
        this.map.set(name, decodeURIComponent(value) === value ? value : value);
      }
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function createSessionJar(url, publishableKey, session) {
  const jar = new CookieJar();
  const ssr = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        for (const c of list) {
          jar.applySetCookie(c.name, c.value, c.options);
        }
      },
    },
  });
  const { error } = await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  assert.equal(error, null, `setSession failed: ${error?.message}`);
  return jar;
}

async function reqJson(jar, route, init = {}) {
  const headers = {
    ...(init.headers || {}),
  };
  if (jar && jar.header()) {
    headers.cookie = jar.header();
  }
  if (init.body && typeof init.body === "string" && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(`${BASE_URL}${route}`, {
    ...init,
    headers,
    redirect: "manual",
  });
  if (jar) jar.applyResponseHeaders(res.headers);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data };
}

async function main() {
  const mode = process.argv.includes("--after-restart")
    ? "after-restart"
    : process.argv.includes("--prepare-restart")
      ? "prepare-restart"
      : "full";

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const pubKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && pubKey && serviceKey, "Missing Supabase env vars in .env.local");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, pubKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (mode === "after-restart") {
    assert.ok(fs.existsSync(RESTART_CONTEXT_PATH), "Restart context file missing");
    const ctx = JSON.parse(fs.readFileSync(RESTART_CONTEXT_PATH, "utf8"));
    try {
      const signInRes = await anon.auth.signInWithPassword({
        email: ctx.emailA,
        password: ctx.password,
      });
      assert.equal(signInRes.error, null, `Re-login after restart failed: ${signInRes.error?.message}`);
      const jarAfterRestart = await createSessionJar(url, pubKey, signInRes.data.session);
      const memRes = await reqJson(jarAfterRestart, "/api/memories");
      assert.equal(memRes.status, 200, "Expected 200 on /api/memories after server restart");
      assert.equal(
        memRes.data.memories.length,
        5,
        `Expected 5 persisted real memories after restart, got ${memRes.data.memories.length}`
      );
      const goalRes = await reqJson(jarAfterRestart, "/api/goals");
      assert.equal(goalRes.status, 200);
      assert.ok(goalRes.data.goals.length >= 1, "Expected persisted goals after restart");
      console.log(
        `[PASS] Post-restart persistence verified: ${memRes.data.memories.length} memories and ${goalRes.data.goals.length} goals restored from Supabase.`
      );
    } finally {
      await admin.auth.admin.deleteUser(ctx.userAId).catch(() => undefined);
      await admin.auth.admin.deleteUser(ctx.userBId).catch(() => undefined);
      if (fs.existsSync(MIGRATION_STATE_PATH)) {
        fs.unlinkSync(MIGRATION_STATE_PATH);
      }
      if (fs.existsSync(RESTART_CONTEXT_PATH)) {
        fs.unlinkSync(RESTART_CONTEXT_PATH);
      }
      assert.ok(fs.existsSync(LOCAL_STORE_PATH), "data/echo-store.json backup MUST remain intact!");
      console.log("[CLEANUP] Removed disposable test users & claim state; preserved data/echo-store.json intact.");
    }
    return;
  }

  // 1. Verify unauthenticated access protection on running Next.js server
  const unauthHome = await reqJson(null, "/");
  assert.equal(unauthHome.status, 307, `Expected redirect for unauth /, got ${unauthHome.status}`);
  assert.ok(
    (unauthHome.headers.get("location") || "").includes("/login"),
    "Unauth / must redirect to /login"
  );
  const unauthApi = await reqJson(null, "/api/bootstrap");
  assert.equal(unauthApi.status, 401, `Expected 401 on unauth /api/bootstrap, got ${unauthApi.status}`);
  const loginPage = await fetch(`${BASE_URL}/login`);
  assert.equal(loginPage.status, 200, "Expected /login to render 200");
  console.log("[PASS] Route protection verified (/ -> 307 /login, /api/bootstrap -> 401, /login -> 200).");

  // Clean slate for disposable test migration run if leftover from interrupted run
  if (fs.existsSync(MIGRATION_STATE_PATH)) {
    fs.unlinkSync(MIGRATION_STATE_PATH);
  }

  const ts = Date.now();
  const password = `EchoV3!Test#${ts}`;
  const emailA = `echo.verify.a.${ts}@example.com`;
  const emailB = `echo.verify.b.${ts}@example.com`;
  const emailC = `echo.verify.c.${ts}@example.com`;

  const createdA = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Jordan Cloud",
      given_name: "Jordan",
      avatar_url: "https://example.com/avatar-a.png",
    },
  });
  assert.equal(createdA.error, null, createdA.error?.message);
  const userA = createdA.data.user;

  const createdB = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Maya Isolated",
      given_name: "Maya",
      avatar_url: "https://example.com/avatar-b.png",
    },
  });
  assert.equal(createdB.error, null, createdB.error?.message);
  const userB = createdB.data.user;

  const createdC = await admin.auth.admin.createUser({
    email: emailC,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Delete Me", given_name: "Del" },
  });
  assert.equal(createdC.error, null, createdC.error?.message);
  const userC = createdC.data.user;

  let shouldCleanupAll = true;
  try {
    // Sign in Account A & test first-login migration
    const loginA = await anon.auth.signInWithPassword({ email: emailA, password });
    assert.equal(loginA.error, null, loginA.error?.message);
    const jarA1 = await createSessionJar(url, pubKey, loginA.data.session);

    const profA = await reqJson(jarA1, "/api/profile");
    assert.equal(profA.status, 200, JSON.stringify(profA.data));
    assert.equal(profA.data.profile.id, userA.id);
    assert.equal(profA.data.profile.onboarded, true, "Migrated profile should preserve onboarded: true");
    assert.equal(profA.data.migration.claimedByCurrentUser, true);

    const migA = await reqJson(jarA1, "/api/migrate");
    assert.equal(migA.status, 200);
    assert.equal(migA.data.cloudCounts.memories, 5, `Expected 5 migrated real memories, got ${migA.data.cloudCounts.memories}`);
    assert.equal(migA.data.cloudCounts.recordings, 4, `Expected 4 migrated recordings, got ${migA.data.cloudCounts.recordings}`);
    assert.equal(migA.data.cloudCounts.actionItems, 4, `Expected 4 migrated action items, got ${migA.data.cloudCounts.actionItems}`);

    // Re-run POST /api/migrate -> must remain 5 memories (idempotent, zero duplicates)
    const remigA = await reqJson(jarA1, "/api/migrate", { method: "POST" });
    assert.equal(remigA.status, 200);
    assert.equal(remigA.data.cloudVerifiedCounts.memories, 5);
    assert.ok(fs.existsSync(LOCAL_STORE_PATH), "data/echo-store.json must NOT be deleted");
    console.log("[PASS] Account A auto-migration + idempotent re-run verified (5 real memories, 0 demo memories, local JSON preserved).");

    // Capture a voice memory for Account A + create a goal + verify Brain Map
    const capA = await reqJson(jarA1, "/api/capture/save", {
      method: "POST",
      body: JSON.stringify({
        transcript: "Account A voice capture: deciding to finalize Supabase cloud sync architecture today.",
        source: "voice",
        durationSec: 14,
      }),
    });
    assert.equal(capA.status, 200, JSON.stringify(capA.data));
    const voiceMemIdA = capA.data.memory.id;
    assert.equal(capA.data.memory.userId, userA.id);

    const goalA = await reqJson(jarA1, "/api/goals", {
      method: "POST",
      body: JSON.stringify({ title: "Verify strict RLS isolation across accounts" }),
    });
    assert.equal(goalA.status, 201, JSON.stringify(goalA.data));

    const memsA = await reqJson(jarA1, "/api/memories");
    assert.equal(memsA.status, 200);
    assert.equal(memsA.data.memories.length, 6);
    assert.ok(memsA.data.memories.every((m) => m.userId === userA.id && !m.isDemo));

    const graphA = await reqJson(jarA1, "/api/graph");
    assert.equal(graphA.status, 200);
    const memNodesA = graphA.data.nodes.filter((n) => n.kind === "memory");
    assert.equal(memNodesA.length, 6, `Expected 6 memory nodes in Account A brain map, got ${memNodesA.length}`);
    assert.ok(graphA.data.entities.length > 0, "Expected populated entities in Supabase for Account A");
    console.log("[PASS] Account A voice capture, goal creation, and Brain Map ownership verified.");

    // Sign in Account B independently
    const loginB = await anon.auth.signInWithPassword({ email: emailB, password });
    assert.equal(loginB.error, null, loginB.error?.message);
    const jarB1 = await createSessionJar(url, pubKey, loginB.data.session);

    const profB = await reqJson(jarB1, "/api/profile");
    assert.equal(profB.status, 200);
    assert.equal(profB.data.profile.id, userB.id);
    assert.equal(profB.data.profile.onboarded, false, "Account B must start un-onboarded");
    assert.equal(profB.data.migration.claimedByOtherUser, true, "Local JSON must NOT migrate to Account B");

    const memsB0 = await reqJson(jarB1, "/api/memories");
    assert.equal(memsB0.status, 200);
    assert.equal(memsB0.data.memories.length, 0, "Account B must have 0 access to Account A or demo memories");

    const goalsB0 = await reqJson(jarB1, "/api/goals");
    assert.equal(goalsB0.data.goals.length, 0);
    const actionsB0 = await reqJson(jarB1, "/api/actions");
    assert.equal(actionsB0.data.actions.length, 0);

    // Cross-user API attempts
    const crossGet = await reqJson(jarB1, `/api/memories/${voiceMemIdA}`);
    assert.equal(crossGet.status, 404, `Expected 404 on cross-user GET memory, got ${crossGet.status}`);
    const crossDel = await reqJson(jarB1, `/api/memories/${voiceMemIdA}`, { method: "DELETE" });
    assert.equal(crossDel.status, 404, `Expected 404 on cross-user DELETE memory, got ${crossDel.status}`);

    // Onboard Account B + capture B memory + create B goal + verify B Brain Map
    const onbB = await reqJson(jarB1, "/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        fullName: "Maya Isolated",
        displayName: "Maya",
        goals: ["Launch studio sprint"],
        improveAreas: ["Focus"],
        language: "English",
        timezone: "UTC",
        onboarded: true,
        seedDemo: false,
      }),
    });
    assert.equal(onbB.status, 200);
    assert.equal(onbB.data.profile.onboarded, true);

    const capB = await reqJson(jarB1, "/api/capture/save", {
      method: "POST",
      body: JSON.stringify({
        transcript: "Account B independent note: planning photography workshop and studio lighting setup.",
        source: "voice",
        durationSec: 10,
      }),
    });
    assert.equal(capB.status, 200);
    assert.equal(capB.data.memory.userId, userB.id);

    const graphB = await reqJson(jarB1, "/api/graph");
    assert.equal(graphB.status, 200);
    const memNodesB = graphB.data.nodes.filter((n) => n.kind === "memory");
    assert.equal(memNodesB.length, 1);
    assert.equal(memNodesB[0].id, capB.data.memory.id);
    console.log("[PASS] Account B onboarding, isolation from Account A, separate capture & Brain Map verified.");

    // Direct Supabase RLS verification (fresh unauthenticated anon client & Account B vs Account A)
    const unauthAnon = createClient(url, pubKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const table of [
      "memories",
      "profiles",
      "goals",
      "action_items",
      "recordings",
      "transcripts",
      "entities",
      "memory_relationships",
    ]) {
      const { data: anonRows } = await unauthAnon.from(table).select("*").limit(5);
      assert.equal((anonRows || []).length, 0, `Anon query on ${table} must return 0 rows`);
    }

    const clientB = createClient(url, pubKey, {
      global: { headers: { Authorization: `Bearer ${loginB.data.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rlsReadA = await clientB.from("memories").select("id").eq("user_id", userA.id);
    assert.equal((rlsReadA.data || []).length, 0, "Account B must read 0 Account A memories via RLS");

    const rlsInsertForged = await clientB.from("memories").insert({
      id: `forged_${ts}`,
      user_id: userA.id,
      date: "2026-11-14",
      time: "12:00",
      category: "memory",
      title: "Forged cross-tenant row",
    });
    assert.ok(rlsInsertForged.error, "RLS must reject inserting a row with another user's user_id");

    const rlsUpdateA = await clientB
      .from("memories")
      .update({ title: "Tampered" })
      .eq("id", voiceMemIdA)
      .select();
    assert.equal((rlsUpdateA.data || []).length, 0, "RLS must prevent Account B from updating Account A rows");

    const rlsDeleteA = await clientB
      .from("memories")
      .delete()
      .eq("id", voiceMemIdA)
      .select();
    assert.equal((rlsDeleteA.data || []).length, 0, "RLS must prevent Account B from deleting Account A rows");
    console.log("[PASS] Direct Supabase PostgREST RLS checks passed (anon blocked, cross-tenant read/insert/update/delete blocked).");

    // Sign out + verify 401 after logout + cross-browser new CookieJar restore
    const outRes = await reqJson(jarA1, "/api/auth/logout", { method: "POST" });
    assert.equal(outRes.status, 200);
    const postOutMem = await reqJson(jarA1, "/api/memories");
    assert.equal(postOutMem.status, 401, `Expected 401 after logout, got ${postOutMem.status}`);

    const loginA2 = await anon.auth.signInWithPassword({ email: emailA, password });
    assert.equal(loginA2.error, null, loginA2.error?.message);
    const jarA2 = await createSessionJar(url, pubKey, loginA2.data.session);
    const crossBrowserMems = await reqJson(jarA2, "/api/memories");
    assert.equal(crossBrowserMems.status, 200);
    assert.equal(crossBrowserMems.data.memories.length, 6, "Second browser session must restore all 6 memories");
    console.log("[PASS] Sign out invalidated session (401) and second browser session restored cloud memories.");

    // Delete captured voice memory -> drops from 6 back to 5
    const delMemRes = await reqJson(jarA2, `/api/memories/${voiceMemIdA}`, { method: "DELETE" });
    assert.equal(delMemRes.status, 200);
    const afterDelMems = await reqJson(jarA2, "/api/memories");
    assert.equal(afterDelMems.data.memories.length, 5);
    console.log("[PASS] Memory deletion verified (6 -> 5).");

    // Test Account C full account deletion (`DELETE /api/profile`)
    const loginC = await anon.auth.signInWithPassword({ email: emailC, password });
    assert.equal(loginC.error, null, loginC.error?.message);
    const jarC = await createSessionJar(url, pubKey, loginC.data.session);
    await reqJson(jarC, "/api/capture/save", {
      method: "POST",
      body: JSON.stringify({ transcript: "Account C temporary note prior to full account deletion.", source: "text" }),
    });
    const delProfC = await reqJson(jarC, "/api/profile", { method: "DELETE" });
    assert.equal(delProfC.status, 200, JSON.stringify(delProfC.data));
    assert.equal(delProfC.data.deleted, true);

    const postDelReqC = await reqJson(jarC, "/api/memories");
    assert.equal(postDelReqC.status, 401, "Deleted Account C session must immediately return 401");
    const { data: leftoverC } = await admin.from("memories").select("id").eq("user_id", userC.id);
    assert.equal((leftoverC || []).length, 0, "Deleted Account C must have 0 leftover memories");
    const userCLookup = await admin.auth.admin.getUserById(userC.id);
    assert.ok(userCLookup.error || !userCLookup.data.user, "Deleted Account C auth user must be removed");
    console.log("[PASS] Account deletion verified (data wiped, auth user removed, Account A untouched).");

    if (mode === "prepare-restart") {
      fs.writeFileSync(
        RESTART_CONTEXT_PATH,
        JSON.stringify({ emailA, password, userAId: userA.id, userBId: userB.id }, null, 2),
        "utf8"
      );
      shouldCleanupAll = false;
      console.log("[READY FOR RESTART CHECK] Restart Next.js dev server and run with --after-restart.");
    }
  } finally {
    if (shouldCleanupAll) {
      await admin.auth.admin.deleteUser(userA.id).catch(() => undefined);
      await admin.auth.admin.deleteUser(userB.id).catch(() => undefined);
      await admin.auth.admin.deleteUser(userC.id).catch(() => undefined);
      if (fs.existsSync(MIGRATION_STATE_PATH)) {
        fs.unlinkSync(MIGRATION_STATE_PATH);
      }
      assert.ok(fs.existsSync(LOCAL_STORE_PATH), "data/echo-store.json backup MUST remain intact!");
      console.log("[CLEANUP] Cleaned disposable test users and migration claim; data/echo-store.json remains intact.");
    }
  }
}

main().catch((err) => {
  console.error("[VERIFY FAILED]", err);
  process.exit(1);
});
