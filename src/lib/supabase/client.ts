import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "../env";

interface RuntimeAuthConfig {
  url: string;
  publishableKey: string;
}

let cachedRuntimeConfig: RuntimeAuthConfig | null = null;
let inflightConfigPromise: Promise<RuntimeAuthConfig | null> | null = null;

async function fetchRuntimeAuthConfig(): Promise<RuntimeAuthConfig | null> {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;
  if (typeof window === "undefined") return null;
  if (!inflightConfigPromise) {
    inflightConfigPromise = fetch("/api/auth/config", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as {
          url?: string;
          publishableKey?: string;
          configured?: boolean;
        };
        if (data?.url && data?.publishableKey) {
          cachedRuntimeConfig = {
            url: data.url,
            publishableKey: data.publishableKey,
          };
          return cachedRuntimeConfig;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        inflightConfigPromise = null;
      });
  }
  return inflightConfigPromise;
}

export function createSupabaseBrowserClient(override?: Partial<RuntimeAuthConfig>) {
  const url = override?.url || cachedRuntimeConfig?.url || supabaseUrl();
  const key =
    override?.publishableKey ||
    cachedRuntimeConfig?.publishableKey ||
    supabasePublishableKey();
  return createBrowserClient(url, key);
}

export async function getSupabaseBrowserClient() {
  const runtime = await fetchRuntimeAuthConfig();
  return createSupabaseBrowserClient(runtime || undefined);
}
