import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

const PUBLIC_PAGE_PREFIXES = ["/login", "/auth/"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.next();
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPage = PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPage && !isPublicApi) {
    if (isApi) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    const redirectRes = NextResponse.redirect(homeUrl);
    response.cookies.getAll().forEach((c) => {
      redirectRes.cookies.set(c);
    });
    return redirectRes;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
