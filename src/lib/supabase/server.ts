import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "../env";

export class UnauthorizedError extends Error {
  readonly status = 401;
  readonly code = "unauthenticated";
  constructor(message = "Authentication required — please sign in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component read-only context: middleware handles cookie refresh.
        }
      },
    },
  });
}

export async function getAuthenticatedUser(): Promise<{
  supabase: SupabaseClient;
  user: User | null;
}> {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Error("Supabase URL and publishable key must be configured.");
  }

  const hdrs = await headers();
  const authHeader = hdrs.get("authorization") || hdrs.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const bearerClient = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await bearerClient.auth.getUser(token);
      if (!error && data.user) {
        return { supabase: bearerClient, user: data.user };
      }
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { supabase, user: null };
  }
  return { supabase, user: data.user };
}

/**
 * Server-only admin client for operations that require Auth Admin API
 * (such as deleting an account from auth.users upon user request).
 * Never expose or import this in client-side code, and never use it as a
 * substitute for user-scoped RLS queries.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
