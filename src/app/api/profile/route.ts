import { fail, handleApiError, ok, readJson, searchParamsOf } from "@/lib/api";
import { getMigrationStatus } from "@/lib/migrate-local";
import { getScopedStore, getStore } from "@/lib/store";
import { createSupabaseAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";
import type { OnboardingPayload, Profile } from "@/lib/types";
import { uid } from "@/lib/util";

export async function GET() {
  try {
    const { store, profile } = await getScopedStore();
    const migration = getMigrationStatus(store.userId);
    return ok({ profile, migration });
  } catch (err) {
    return handleApiError(err, "Failed to load profile");
  }
}

export async function PUT(req: Request) {
  try {
    const body = await readJson<
      OnboardingPayload & { name?: string; onboarded?: boolean; seedDemo?: boolean }
    >(req);
    const store = await getStore();
    const patch: Partial<Profile> = {};

    if (typeof body.fullName === "string") patch.fullName = body.fullName.trim().slice(0, 80);
    if (typeof body.displayName === "string" && body.displayName.trim()) {
      patch.displayName = body.displayName.trim().slice(0, 40);
      patch.name = patch.displayName;
    } else if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim().slice(0, 40);
      patch.displayName = patch.name;
    }
    if (body.email !== undefined) {
      const email = (body.email || "").trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail("That email address doesn't look valid.", 400);
      }
      patch.email = email || null;
    }
    if (Array.isArray(body.goals)) {
      patch.goals = body.goals
        .filter((g) => typeof g === "string" && g.trim())
        .map((g) => g.trim().slice(0, 120))
        .slice(0, 8);
    }
    if (Array.isArray(body.improveAreas)) {
      patch.improveAreas = body.improveAreas
        .filter((g) => typeof g === "string" && g.trim())
        .map((g) => g.trim().slice(0, 120))
        .slice(0, 8);
    }
    if (typeof body.language === "string" && body.language.trim()) {
      patch.language = body.language.trim().slice(0, 30);
    }
    if (typeof body.timezone === "string" && body.timezone.trim()) {
      patch.timezone = body.timezone.trim().slice(0, 60);
    }
    if (typeof body.onboarded === "boolean") patch.onboarded = body.onboarded;

    const updated = await store.updateProfile(patch);

    if (Array.isArray(patch.goals) && patch.goals.length > 0) {
      const existingGoals = await store.listGoals(false);
      const have = new Set(existingGoals.map((g) => g.title.trim().toLowerCase()));
      const now = new Date().toISOString();
      for (const title of patch.goals) {
        if (have.has(title.toLowerCase())) continue;
        have.add(title.toLowerCase());
        await store.addGoal({
          id: uid("goal"),
          userId: store.userId,
          title,
          status: "active",
          sourceMemoryId: null,
          createdAt: now,
          isDemo: false,
        });
      }
    }

    if (body.seedDemo === true) {
      await store.restoreDemo();
      await store.updateSettings({ demoMode: true });
    }

    return ok({ profile: await store.getProfile() });
  } catch (err) {
    return handleApiError(err, "Failed to save profile");
  }
}

export async function DELETE(req: Request) {
  try {
    const store = await getStore();
    const userId = store.userId;
    const keepAuthUser = searchParamsOf(req).get("keepAuthUser") === "1";

    await store.resetProfile();

    const { supabase } = await getAuthenticatedUser();
    await supabase.auth.signOut().catch(() => undefined);

    if (!keepAuthUser) {
      const admin = createSupabaseAdminClient();
      if (admin) {
        const { error: delErr } = await admin.auth.admin.deleteUser(userId);
        if (delErr && !/not found/i.test(delErr.message)) {
          return fail(`Failed to delete auth account: ${delErr.message}`, 500);
        }
      }
    }

    return ok({
      deleted: true,
      userId,
      message: "Account and all personal data permanently deleted.",
    });
  } catch (err) {
    return handleApiError(err, "Failed to delete account");
  }
}
