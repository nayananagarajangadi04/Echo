import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import { SupabaseStore } from "@/lib/store/supabase";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") || "/";
  const nextPath = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const oauthErr = searchParams.get("error_description") || searchParams.get("error");

  if (oauthErr) {
    const loginErr = new URL("/login", origin);
    loginErr.searchParams.set("error", oauthErr);
    return NextResponse.redirect(loginErr);
  }

  if (!code) {
    const loginErr = new URL("/login", origin);
    loginErr.searchParams.set("error", "Missing OAuth authorization code.");
    return NextResponse.redirect(loginErr);
  }

  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    const loginErr = new URL("/login", origin);
    loginErr.searchParams.set("error", "Supabase environment variables are not configured.");
    return NextResponse.redirect(loginErr);
  }

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    const loginErr = new URL("/login", origin);
    loginErr.searchParams.set("error", error?.message || "Could not complete sign-in.");
    return NextResponse.redirect(loginErr);
  }

  let destination = nextPath;
  try {
    const store = new SupabaseStore(supabase, {
      id: data.user.id,
      email: data.user.email ?? null,
      userMetadata: (data.user.user_metadata as Record<string, unknown>) || {},
    });
    await store.init();
    const profile = await store.getProfile();
    if (!profile.onboarded) {
      destination = "/onboarding";
    }
  } catch {
    destination = nextPath;
  }

  const redirectRes = NextResponse.redirect(new URL(destination, origin));
  for (const { name, value, options } of pendingCookies) {
    redirectRes.cookies.set(name, value, options);
  }
  return redirectRes;
}
