"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AudioLines, CircleAlert, Lock, Mail, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Btn, Spinner, inputCls } from "@/components/ui";
import { cn } from "@/lib/cn";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get("next") || "/";
  const nextPath = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const queryErr = searchParams.get("error");
    if (queryErr) {
      setError(queryErr);
    }
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashErr = hashParams.get("error_description") || hashParams.get("error");
      if (hashErr) setError(hashErr);
    }
  }, [searchParams]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) {
          router.replace(nextPath);
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [nextPath, router]);

  async function continueWithGoogle() {
    setBusy("google");
    setError(null);
    setInfo(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (nextPath !== "/") {
        callbackUrl.searchParams.set("next", nextPath);
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Google sign-in.");
      setBusy(null);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy("email");
    setError(null);
    setInfo(null);
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "signin") {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) {
          setError(signInErr.message);
          setBusy(null);
          return;
        }
        if (data.session) {
          router.replace(nextPath);
          router.refresh();
        }
      } else {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpErr) {
          setError(signUpErr.message);
          setBusy(null);
          return;
        }
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          setInfo("Check your email to confirm your account, then sign in.");
          setBusy(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
      setBusy(null);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl grad-accent shadow-lg">
            <AudioLines className="h-6 w-6 text-white" strokeWidth={2.4} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg-strong">
            Sign in to <span className="text-grad">ECHO</span>
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
            Your personal intelligence cloud. Memories, brain map, commitments and insights stay
            isolated to your account across every device.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-6 shadow-xl">
          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <div>
                <div className="font-medium text-rose-100">Authentication error</div>
                <div className="mt-0.5 leading-relaxed text-rose-200/90">{error}</div>
              </div>
            </div>
          )}

          {info && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
              {info}
            </div>
          )}

          <button
            type="button"
            onClick={() => void continueWithGoogle()}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-line-2 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "google" ? <Spinner className="h-4 w-4 border-zinc-400 border-t-zinc-900" /> : <GoogleIcon />}
            {busy === "google" ? "Redirecting to Google…" : "Continue with Google"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <button
              type="button"
              onClick={() => setShowEmail((v) => !v)}
              className="text-[11px] font-medium text-dim transition hover:text-muted"
            >
              {showEmail ? "Hide email sign-in" : "Or use email & password"}
            </button>
            <div className="h-px flex-1 bg-line" />
          </div>

          {showEmail && (
            <form onSubmit={(e) => void submitEmail(e)} className="space-y-3">
              <div>
                <span className="micro">Email</span>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-dim" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={cn(inputCls, "pl-9")}
                  />
                </div>
              </div>
              <div>
                <span className="micro">Password</span>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-dim" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={cn(inputCls, "pl-9")}
                  />
                </div>
              </div>
              <Btn type="submit" variant="primary" className="w-full py-2.5" disabled={busy !== null}>
                {busy === "email" ? (
                  <Spinner className="h-4 w-4" />
                ) : mode === "signin" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Btn>
              <div className="text-center text-[11px] text-dim">
                {mode === "signin" ? (
                  <>
                    New to ECHO?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="text-accent-2 hover:underline"
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signin")}
                      className="text-accent-2 hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </form>
          )}

          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-panel-2 px-3.5 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-soft" />
            <p className="text-[11px] leading-relaxed text-dim">
              Protected by Supabase Row Level Security. Every memory, transcript and graph edge is
              scoped to your verified user identity and never shared across accounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
