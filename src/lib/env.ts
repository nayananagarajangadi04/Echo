import type { StoreFlags } from "./types";

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
}

export function supabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

export function getFlags(): StoreFlags {
  const gemini = !!process.env.GEMINI_API_KEY;
  const supabase = !!(supabaseUrl() && supabasePublishableKey());
  return {
    gemini,
    supabase,
    storeMode: supabase ? "supabase" : "local",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}
