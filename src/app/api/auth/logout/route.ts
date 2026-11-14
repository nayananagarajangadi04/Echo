import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ok } from "@/lib/api";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Sign out best-effort even if session is already expired
  }
  return ok({ ok: true });
}
