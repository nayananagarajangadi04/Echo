"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AudioLines,
  CalendarRange,
  FlaskConical,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Network,
  Settings,
  Sparkles,
} from "lucide-react";
import { EchoContext, apiGet, type EchoBoot } from "@/lib/echo-context";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/companion", label: "Companion", icon: Sparkles },
  { href: "/", label: "Capture", icon: LayoutDashboard },
  { href: "/brain", label: "Brain map", icon: Network },
  { href: "/timeline", label: "Timeline", icon: CalendarRange },
  { href: "/actions", label: "Commitments", icon: AudioLines },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ShellSkeleton() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 animate-pulse rounded-md grad-accent opacity-60" />
            <div className="h-3 w-16 animate-pulse rounded bg-panel-3" />
          </div>
          <div className="flex gap-1">
            {NAV.map((n) => (
              <div key={n.href} className="h-6 w-16 animate-pulse rounded bg-panel-2" />
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [boot, setBoot] = useState<EchoBoot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const isPublicAuth =
    pathname === "/login" || pathname.startsWith("/auth/");
  const isOnboarding = pathname === "/onboarding";

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<EchoBoot>("/api/bootstrap");
      setBoot(data);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setBoot(null);
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load ECHO");
    }
  }, [router]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setBoot(null);
      window.location.href = "/login";
    }
  };

  useEffect(() => {
    if (isPublicAuth || isOnboarding) return;
    void refresh();
  }, [isPublicAuth, isOnboarding, refresh]);

  if (isPublicAuth || isOnboarding) {
    return <>{children}</>;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-line bg-panel p-6 text-center">
          <div className="text-sm font-medium text-fg-strong">ECHO could not start</div>
          <div className="mt-2 text-xs leading-relaxed text-muted">{error}</div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => void refresh()}
              className="rounded-lg grad-accent px-4 py-2 text-[13px] font-medium text-white"
            >
              Retry
            </button>
            <button
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-line bg-panel-2 px-4 py-2 text-[13px] font-medium text-muted hover:text-fg"
            >
              Sign in again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!boot) {
    return <ShellSkeleton />;
  }

  if (!boot.profile.onboarded) {
    router.replace("/onboarding");
    return <ShellSkeleton />;
  }

  const initial = (boot.profile.displayName || boot.profile.fullName || boot.profile.email || "E")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <EchoContext.Provider value={{ ...boot, refresh }}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-line bg-ink-950/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md grad-accent">
                <AudioLines className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-fg-strong">
                ECHO
              </span>
              {boot.demoMode && (
                <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Demo data
                </span>
              )}
            </Link>
            <nav className="hidden items-center gap-0.5 md:flex">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition",
                      active ? "bg-panel-3 text-fg-strong" : "text-muted hover:bg-panel-2 hover:text-fg"
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2.5">
              {!boot.flags.gemini && (
                <Link
                  href="/settings"
                  className="hidden items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300 sm:flex"
                  title="Set GEMINI_API_KEY to enable AI extraction and chat"
                >
                  <FlaskConical className="h-3 w-3" /> AI key needed
                </Link>
              )}
              <Link
                href="/settings"
                className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full grad-accent text-[12px] font-semibold text-white ring-1 ring-white/10"
                title={`Signed in as ${boot.profile.email || boot.profile.displayName || boot.profile.fullName || "you"}`}
              >
                {boot.profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={boot.profile.avatarUrl}
                    alt={boot.profile.displayName || "Profile"}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  initial
                )}
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1 text-[11px] font-medium text-muted transition hover:text-fg disabled:opacity-50"
                title="Sign out"
              >
                <LogOut className="h-3 w-3" />
                <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition",
                    active ? "bg-panel-3 text-fg-strong" : "text-muted hover:text-fg"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4">
          <p className="text-center text-[11px] text-dim">
            ECHO stores exactly what you said. {boot.flags.storeMode === "supabase" ? "Synced to your Supabase project." : "Data lives on this device."}
          </p>
        </footer>
      </div>
    </EchoContext.Provider>
  );
}
