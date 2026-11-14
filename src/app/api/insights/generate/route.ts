import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { getFlags } from "@/lib/env";
import { reflectWithGemini } from "@/lib/gemini";
import { analyzedOnly, buildImprovementPlan, makeInsight, narrativeReflection, windowMemories } from "@/lib/insights";
import { getScopedStore } from "@/lib/store";
import { dateLabel, truncate, uid } from "@/lib/util";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ kind?: string }>(req);
    const kind = body.kind;
    if (kind !== "daily" && kind !== "weekly" && kind !== "plan") {
      return fail("kind must be 'daily', 'weekly' or 'plan'", 400);
    }
    const { store, profile, demoMode } = await getScopedStore();
    const flags = getFlags();
    const all = await store.listMemories({ demoMode });
    const actions = await store.listActions({ demoMode });
    const memories = analyzedOnly(all);

    if (kind === "plan") {
      const plan = buildImprovementPlan(memories, actions);
      if (plan.length === 0) {
        return fail(
          "Not enough analyzed memories to build an evidence-backed plan yet. Capture a few days first.",
          400
        );
      }
      const created = [];
      for (const item of plan) {
        for (const actionText of item.actions.slice(0, 1)) {
          const a = await store.addAction({
            id: uid("act"),
            userId: store.userId,
            memoryId: item.evidenceIds[0] || null,
            title: truncate(actionText, 90),
            detail: `Improvement plan — ${item.area}. ${item.reason}`,
            dueDate: null,
            status: "suggested",
            source: "ai",
            createdAt: new Date().toISOString(),
            completedAt: null,
            isDemo: demoMode,
          });
          created.push(a);
        }
      }
      return ok({ plan, created });
    }

    if (memories.length === 0) {
      return fail(
        "No analyzed memories yet. Capture something and let AI extraction finish before generating a reflection.",
        400
      );
    }

    const latestDate = memories.length ? memories[memories.length - 1].date : "";
    const today = new Date().toLocaleDateString("en-CA");
    const dailyDate = memories.some((m) => m.date === today) ? today : latestDate;
    const scoped =
      kind === "daily" ? memories.filter((m) => m.date === dailyDate) : windowMemories(memories, 7).window;
    const evidence = scoped.slice(0, 8);

    let data: {
      title: string;
      body: string;
      evidenceIds: string[];
      metrics: Record<string, string | number>;
    } | null = null;

    if (flags.gemini) {
      const profileBlock = [
        profile.displayName ? `User: ${profile.displayName}` : "",
        profile.goals.length ? `Stated goals: ${profile.goals.join("; ")}` : "",
        profile.improveAreas.length ? `Wants to improve: ${profile.improveAreas.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const block = [
        `Period: ${kind}`,
        profileBlock,
        `Memories (${scoped.length}):`,
        ...scoped.map(
          (m) =>
            `- [${m.id}] ${m.date} ${m.time} (${m.category}) ${m.title}. ${m.summary}${m.problems.length ? ` Problems: ${m.problems.join("; ")}` : ""}${m.commitments.length ? ` Commitments: ${m.commitments.join("; ")}` : ""}`
        ),
        `Open actions: ${actions.filter((a) => a.status === "open").length}, completed: ${actions.filter((a) => a.status === "done").length}`,
      ]
        .filter(Boolean)
        .join("\n");
      const ai = await reflectWithGemini(kind, block).catch(() => null);
      if (ai) {
        data = { ...ai, evidenceIds: evidence.map((m) => m.id), metrics: { memories: scoped.length } };
      }
    }

    if (!data) {
      data = narrativeReflection(kind, memories, actions);
    }

    const insight = makeInsight(kind, data, store.userId);
    const saved = await store.addInsight({ ...insight, isDemo: demoMode });
    return ok({
      insight: saved,
      periodStart: scoped[0]?.date,
      periodEnd: scoped.at(-1)?.date,
      dateLabels: scoped.slice(0, 3).map((m) => dateLabel(m.date)),
    });
  } catch (err) {
    return handleApiError(err, "Failed to generate insight");
  }
}
