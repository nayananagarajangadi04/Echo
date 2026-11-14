"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, AudioLines, Check, Database, Plus, ShieldCheck, X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/echo-context";
import { cn } from "@/lib/cn";
import { Btn, Toggle, inputCls } from "@/components/ui";
import type { Profile } from "@/lib/types";

const GOAL_IDEAS = [
  "Grow my career",
  "Build a business",
  "Stay healthy & fit",
  "Learn new skills",
  "Strengthen relationships",
  "Financial stability",
  "Creative projects",
  "Emotional wellbeing",
];

const IMPROVE_IDEAS = [
  "Focus & productivity",
  "Communication",
  "Confidence",
  "Sleep & energy",
  "Stress management",
  "Decision making",
  "Memory",
  "Time management",
];

const STEPS = ["Who you are", "Your goals", "What to improve", "Preferences"];

function ChipPicker({
  ideas,
  selected,
  onToggle,
  onAdd,
  placeholder,
}: {
  ideas: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onAdd: (v: string) => void;
  placeholder: string;
}) {
  const [custom, setCustom] = useState("");
  const extras = selected.filter((s) => !ideas.includes(s));
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ideas.map((idea) => {
          const on = selected.includes(idea);
          return (
            <button
              key={idea}
              type="button"
              onClick={() => onToggle(idea)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition",
                on
                  ? "border-accent/50 bg-accent/15 text-fg-strong"
                  : "border-line-2 bg-panel-2 text-muted hover:border-line-2 hover:text-fg"
              )}
            >
              {on && <Check className="h-3 w-3 text-accent-2" strokeWidth={3} />}
              {idea}
            </button>
          );
        })}
        {extras.map((extra) => (
          <button
            key={extra}
            type="button"
            onClick={() => onToggle(extra)}
            className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-[13px] font-medium text-fg-strong"
          >
            {extra}
            <X className="h-3 w-3 text-accent-2" />
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              e.preventDefault();
              onAdd(custom.trim());
              setCustom("");
            }
          }}
          placeholder={placeholder}
          className={cn(inputCls, "max-w-xs")}
        />
        <Btn
          variant="ghost"
          disabled={!custom.trim() || selected.includes(custom.trim())}
          onClick={() => {
            onAdd(custom.trim());
            setCustom("");
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Btn>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [improveAreas, setImproveAreas] = useState<string[]>([]);
  const [language, setLanguage] = useState("English");
  const [demoData, setDemoData] = useState(false);

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiGet<{ profile: Profile }>("/api/profile")
      .then(({ profile }) => {
        if (!active) return;
        if (profile.onboarded) {
          router.replace("/");
          return;
        }
        if (profile.fullName) setFullName((v) => v || profile.fullName);
        if (profile.displayName || profile.name) {
          setDisplayName((v) => v || profile.displayName || profile.name);
        }
        if (profile.email) setEmail((v) => v || profile.email || "");
        if (profile.avatarUrl) setAvatarUrl(profile.avatarUrl);
        if (profile.goals?.length) setGoals(profile.goals);
        if (profile.improveAreas?.length) setImproveAreas(profile.improveAreas);
        if (profile.language) setLanguage(profile.language);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  const canNext =
    step === 0
      ? fullName.trim().length > 0 || displayName.trim().length > 0
      : true;

  function toggleIn(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((g) => g !== value) : [...list, value]);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const name = displayName.trim() || fullName.trim();
      await apiSend("/api/profile", "PUT", {
        fullName: fullName.trim() || name,
        displayName: name,
        email: email.trim() || null,
        goals,
        improveAreas,
        language: language.trim() || "English",
        timezone,
        onboarded: true,
        seedDemo: demoData,
      });
      await apiSend("/api/settings", "PUT", { demoMode: demoData });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const slide = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl grad-accent">
            <AudioLines className="h-5 w-5 text-white" strokeWidth={2.4} />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg-strong">
            Welcome to <span className="text-grad">ECHO</span>
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
            Your second brain that remembers your life — exactly as you say it.
            Four quick steps and you&apos;re capturing.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition",
                  i === step
                    ? "border-accent/50 bg-accent/15 text-fg-strong"
                    : i < step
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                      : "border-line bg-panel text-dim"
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="h-px w-4 bg-line" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-panel p-6">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s0" {...slide} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-fg-strong">What should ECHO call you?</h2>
                  <p className="mt-1 text-xs text-dim">
                    Signed in with your ECHO cloud account. Preferences are synced per account.
                  </p>
                </div>
                {(avatarUrl || email) && (
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2.5">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={fullName || "Google avatar"}
                        className="h-9 w-9 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full grad-accent text-sm font-semibold text-white">
                        {(displayName || fullName || email || "E").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-fg-strong">
                        {fullName || displayName || "Connected Account"}
                      </div>
                      {email && <div className="truncate text-[11px] text-dim">{email}</div>}
                    </div>
                  </div>
                )}
                <div>
                  <span className="micro">Full name</span>
                  <input
                    autoFocus
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (!displayName) setDisplayName(e.target.value.split(" ")[0] || "");
                    }}
                    placeholder="e.g. Alex Rivera"
                    className={cn(inputCls, "mt-1.5")}
                  />
                </div>
                <div>
                  <span className="micro">Name to use</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alex"
                    className={cn(inputCls, "mt-1.5")}
                  />
                </div>
                <div>
                  <span className="micro">Email (optional)</span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={cn(inputCls, "mt-1.5")}
                  />
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="s1" {...slide} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-fg-strong">What are you working toward?</h2>
                  <p className="mt-1 text-xs text-dim">
                    ECHO connects your daily stories to these goals — pick any, or skip.
                  </p>
                </div>
                <ChipPicker
                  ideas={GOAL_IDEAS}
                  selected={goals}
                  onToggle={(v) => toggleIn(goals, setGoals, v)}
                  onAdd={(v) => setGoals([...goals, v])}
                  placeholder="Add a personal goal"
                />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" {...slide} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-fg-strong">What do you want to improve?</h2>
                  <p className="mt-1 text-xs text-dim">
                    Weekly reflections will watch for patterns in these areas.
                  </p>
                </div>
                <ChipPicker
                  ideas={IMPROVE_IDEAS}
                  selected={improveAreas}
                  onToggle={(v) => toggleIn(improveAreas, setImproveAreas, v)}
                  onAdd={(v) => setImproveAreas([...improveAreas, v])}
                  placeholder="Add a focus area"
                />
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" {...slide} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-fg-strong">Last preferences</h2>
                  <p className="mt-1 text-xs text-dim">You can change everything later in Settings.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="micro">Language</span>
                    <input
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className={cn(inputCls, "mt-1.5")}
                    />
                  </div>
                  <div>
                    <span className="micro">Timezone (auto)</span>
                    <input value={timezone} readOnly className={cn(inputCls, "mt-1.5 opacity-70")} />
                  </div>
                </div>
                <Toggle
                  checked={demoData}
                  onChange={setDemoData}
                  label="Start with sample data"
                  description="Explore ECHO with a realistic two-week demo journal. Clear it any time from Settings — your real captures stay separate."
                />
                <div className="flex items-start gap-2.5 rounded-lg border border-line bg-panel-2 px-4 py-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <p className="text-[11px] leading-relaxed text-muted">
                    <span className="font-medium text-fg">You own your data.</span> Transcripts are stored
                    word-for-word in your private ECHO cloud account (Supabase PostgreSQL with Row Level
                    Security), exportable any time, deletable in one click.
                  </p>
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-dim" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <div className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}

          <div className="mt-6 flex items-center justify-between">
            <Btn variant="ghost" disabled={busy || step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Btn>
            {step < STEPS.length - 1 ? (
              <Btn variant="primary" disabled={!canNext || busy} onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </Btn>
            ) : (
              <Btn variant="primary" disabled={busy} onClick={() => void finish()}>
                {busy ? "Setting up…" : "Start capturing"}
                <AudioLines className="h-3.5 w-3.5" />
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
