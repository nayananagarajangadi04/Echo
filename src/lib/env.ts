import type { StoreFlags } from "./types";

/**
 * Normalizes environment values pasted into hosting dashboards (Vercel, etc.):
 * trims whitespace/newlines, strips an accidental `KEY_NAME=` prefix, and
 * removes wrapping single/double quotes that would cause Supabase to return
 * `401 Invalid API key`.
 */
export function cleanEnvValue(raw?: string | null): string {
  if (!raw) return "";
  let val = raw.trim();
  if (/^[A-Z0-9_]{3,}=/.test(val)) {
    val = val.slice(val.indexOf("=") + 1).trim();
  }
  while (
    val.length >= 2 &&
    ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'")))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

function projectRefFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    const parts = host.split(".");
    return parts.length >= 3 && host.endsWith(".supabase.co") ? parts[0] : "";
  } catch {
    return "";
  }
}

function decodeJwtPayload(token: string): { ref?: string; role?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as { ref?: string; role?: string };
  } catch {
    return null;
  }
}

export function supabaseUrl(): string {
  const raw =
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    cleanEnvValue(process.env.SUPABASE_URL);
  return raw.replace(/\/+$/, "");
}

export function supabasePublishableKey(): string {
  const url = supabaseUrl();
  const expectedRef = projectRefFromUrl(url);

  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  ];

  for (const raw of candidates) {
    const val = cleanEnvValue(raw);
    if (!val) continue;
    // Never accept a secret / service-role key as the public publishable key.
    if (val.startsWith("sb_secret_")) continue;
    if (val.startsWith("http://") || val.startsWith("https://")) continue;

    if (val.startsWith("eyJ")) {
      const claims = decodeJwtPayload(val);
      if (claims?.role === "service_role") continue;
      if (expectedRef && claims?.ref && claims.ref !== expectedRef) continue;
    }

    return val;
  }

  return "";
}

export function supabaseServiceRoleKey(): string {
  return (
    cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    cleanEnvValue(process.env.SUPABASE_SECRET_KEY)
  );
}

export function geminiApiKey(): string {
  return cleanEnvValue(process.env.GEMINI_API_KEY);
}

export function getFlags(): StoreFlags {
  const gemini = !!geminiApiKey();
  const supabase = !!(supabaseUrl() && supabasePublishableKey());
  return {
    gemini,
    supabase,
    storeMode: supabase ? "supabase" : "local",
    model: geminiModel(),
  };
}

const DEPRECATED_FLASH_RE = /^gemini-(?:2\.[05]|1\.5)-flash$/i;

export function geminiModel(): string {
  const configured = cleanEnvValue(process.env.GEMINI_MODEL);
  if (!configured || DEPRECATED_FLASH_RE.test(configured)) {
    return "gemini-3.5-flash-lite";
  }
  return configured;
}
