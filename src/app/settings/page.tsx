"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Database,
  Download,
  FileJson,
  KeyRound,
  LogOut,
  Mic,
  Pencil,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEcho, apiGet, apiSend } from "@/lib/echo-context";
import { api, del, post } from "@/lib/client";
import { Btn, Card, Chip, Field, Spinner, Toggle, inputCls } from "@/components/ui";
import type { Profile } from "@/lib/types";

interface MigrationOverview {
  userId: string;
  hasLocalBackup: boolean;
  localRealMemoryCount: number;
  claimedByCurrentUser: boolean;
  claimedByOtherUser: boolean;
  state: { migratedToUserId: string; migratedAt: string; counts: Record<string, number> } | null;
  cloudCounts: {
    memories: number;
    recordings: number;
    actionItems: number;
    goals: number;
    relationships: number;
  };
}

export default function SettingsPage() {
  const echo = useEcho();
  const { profile, flags, stats, demoMode } = echo;
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [micState, setMicState] = useState<string>("unknown");
  const [migration, setMigration] = useState<MigrationOverview | null>(null);
  const [form, setForm] = useState({
    fullName: profile.fullName || "",
    displayName: profile.displayName || "",
    email: profile.email || "",
    language: profile.language || "English",
    timezone: profile.timezone || "",
    goals: [...profile.goals],
    improveAreas: [...profile.improveAreas],
  });

  useEffect(() => {
    if (!editing) {
      setForm({
        fullName: profile.fullName || "",
        displayName: profile.displayName || "",
        email: profile.email || "",
        language: profile.language || "English",
        timezone: profile.timezone || "",
        goals: [...profile.goals],
        improveAreas: [...profile.improveAreas],
      });
    }
  }, [profile, editing]);

  useEffect(() => {
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((res) => setMicState(res.state))
      .catch(() => setMicState("unsupported"));
    apiGet<MigrationOverview>("/api/migrate")
      .then(setMigration)
      .catch(() => undefined);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const signOut = async () => {
    setBusy("logout");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  const syncBackup = async () => {
    setBusy("migrate");
    try {
      const res = await apiSend<{ status: string; counts: { memories: number } }>("/api/migrate", "POST");
      const updated = await apiGet<MigrationOverview>("/api/migrate");
      setMigration(updated);
      await echo.refresh();
      flash(
        res.status === "migrated"
          ? `Verified ${res.counts.memories} real memories synced to cloud.`
          : `Cloud backup status: ${res.status}.`
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "Migration failed.");
    } finally {
      setBusy(null);
    }
  };

  const updateSettings = async (patch: { keepTranscripts?: boolean; keepAudio?: boolean; demoMode?: boolean }) => {
    setBusy("settings");
    try {
      await apiSend("/api/settings", "PUT", patch);
      await echo.refresh();
      flash("Settings saved.");
    } catch {
      flash("Could not save settings.");
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    setBusy("profile");
    try {
      await apiSend("/api/profile", "PUT", form);
      await echo.refresh();
      setEditing(false);
      flash("Profile updated.");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (key: string, label: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      flash(`${label} done.`);
      await echo.refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : `${label} failed.`);
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (
      !window.confirm(
        "Delete your account and ALL personal data?\n\nEvery memory, transcript, recording entry, commitment, goal and insight will be permanently erased. This cannot be undone."
      )
    ) {
      return;
    }
    setBusy("delete-account");
    try {
      await apiSend("/api/profile", "DELETE");
      window.location.href = "/login";
    } catch (e) {
      flash(e instanceof Error ? e.message : "Deletion failed.");
      setBusy(null);
    }
  };

  function toggleIn(list: string[], key: "goals" | "improveAreas", value: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((g) => g !== value) : [...f[key], value],
    }));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-bold tracking-tight">Settings</h1>
      </div>

      {toast && (
        <div className="rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-xs text-muted">{toast}</div>
      )}

      <Card
        title="Your profile"
        action={
          !editing && (
            <div className="flex items-center gap-2">
              <Btn variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Btn>
              <Btn variant="ghost" onClick={() => void signOut()} disabled={busy !== null}>
                <LogOut className="h-3 w-3" /> Sign out
              </Btn>
            </div>
          )
        }
      >
        {!editing ? (
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full grad-accent text-lg font-semibold text-white">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName || profile.fullName || "Avatar"}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                (profile.displayName || profile.fullName || "E").charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5 text-sm">
              <div className="font-medium text-fg-strong">
                {profile.fullName || profile.name || "Unnamed"}{" "}
                {profile.displayName && profile.displayName !== profile.fullName && `· goes by ${profile.displayName}`}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {profile.email && <span>{profile.email}</span>}
                <span className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-dim">
                  Account {profile.id.slice(0, 8)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {profile.goals.map((g) => (
                  <Chip key={g} color={{ color: "text-violet-300", bg: "bg-violet-400/10 border border-violet-400/25" }}>
                    {g}
                  </Chip>
                ))}
                {profile.improveAreas.map((a) => (
                  <Chip key={a} color={{ color: "text-sky-300", bg: "bg-sky-400/10 border border-sky-400/25" }}>
                    {a}
                  </Chip>
                ))}
              </div>
              <div className="pt-1 text-[11px] text-dim">
                {profile.language || "English"} · {profile.timezone || "unknown timezone"} · onboarded{" "}
                {new Date(profile.createdAt || Date.now()).toLocaleDateString()}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name">
                <input
                  className={inputCls}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </Field>
              <Field label="Display name">
                <input
                  className={inputCls}
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email (optional)">
                <input
                  className={inputCls}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Language">
                <input
                  className={inputCls}
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                />
              </Field>
            </div>
            <div>
              <span className="micro">Goals</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {form.goals.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleIn(form.goals, "goals", g)}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-[11px] text-violet-200"
                  >
                    {g} <X className="h-3 w-3" />
                  </button>
                ))}
                <AddInline onAdd={(v) => setForm((f) => ({ ...f, goals: [...f.goals, v] }))} />
              </div>
            </div>
            <div>
              <span className="micro">Improve areas</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {form.improveAreas.map((a) => (
                  <button
                    key={a}
                    onClick={() => toggleIn(form.improveAreas, "improveAreas", a)}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[11px] text-sky-200"
                  >
                    {a} <X className="h-3 w-3" />
                  </button>
                ))}
                <AddInline onAdd={(v) => setForm((f) => ({ ...f, improveAreas: [...f.improveAreas, v] }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setEditing(false)} disabled={busy !== null}>
                Cancel
              </Btn>
              <Btn variant="primary" onClick={() => void saveProfile()} disabled={busy !== null}>
                {busy === "profile" ? <Spinner className="h-3 w-3" /> : <Check className="h-3.5 w-3.5" />} Save
              </Btn>
            </div>
          </div>
        )}
      </Card>

      <Card title="System status">
        <div className="space-y-3 text-sm">
          <Row
            icon={<Database className="h-4 w-4" />}
            label="Storage"
            value={
              flags.supabase ? (
                flags.storageWarning ? (
                  <Chip color={{ color: "text-amber-300", bg: "bg-amber-400/10 border border-amber-400/25" }}>
                    Supabase not ready — using local store
                  </Chip>
                ) : (
                  <Chip color={{ color: "text-emerald-300", bg: "bg-emerald-400/10 border border-emerald-400/25" }}>
                    Supabase connected
                  </Chip>
                )
              ) : (
                <Chip color={{ color: "text-sky-300", bg: "bg-sky-400/10 border border-sky-400/25" }}>
                  Local persistent store
                </Chip>
              )
            }
            hint={
              flags.storageWarning
                ? flags.storageWarning
                : flags.supabase
                  ? "All writes go to your Supabase PostgreSQL instance."
                  : "Data persists to data/echo-store.json on disk. Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to move to PostgreSQL — the SQL migration is included in supabase/migrations."
            }
          />
          <Row
            icon={<KeyRound className="h-4 w-4" />}
            label="AI provider"
            value={
              flags.gemini ? (
                <Chip color={{ color: "text-emerald-300", bg: "bg-emerald-400/10 border border-emerald-400/25" }}>
                  Gemini connected ({flags.model})
                </Chip>
              ) : (
                <Chip color={{ color: "text-amber-300", bg: "bg-amber-400/10 border border-amber-400/25" }}>
                  Gemini not configured
                </Chip>
              )
            }
            hint={
              flags.gemini
                ? "Transcription, memory extraction and chat reasoning use Gemini."
                : "Set GEMINI_API_KEY to unlock AI extraction and server transcription. Until then, transcripts are stored verbatim and marked 'Awaiting AI' — nothing is inferred or invented. Chromium browsers get on-device voice transcription."
            }
          />
          <Row
            icon={<Mic className="h-4 w-4" />}
            label="Microphone permission"
            value={
              <Chip
                color={
                  micState === "granted"
                    ? { color: "text-emerald-300", bg: "bg-emerald-400/10 border border-emerald-400/25" }
                    : micState === "denied"
                      ? { color: "text-rose-300", bg: "bg-rose-400/10 border border-rose-400/25" }
                      : { color: "text-dim", bg: "bg-panel-3 border border-line" }
                }
              >
                {micState === "granted"
                  ? "Granted"
                  : micState === "denied"
                    ? "Blocked — enable in browser"
                    : micState === "unsupported"
                      ? "Check on first use"
                      : "Prompt on first use"}
              </Chip>
            }
            hint="Voice capture requests permission the first time you press record. If blocked, use the padlock icon in the address bar."
          />
          <Row
            icon={<FileJson className="h-4 w-4" />}
            label="Data"
            value={
              <span className="text-xs text-muted">
                {stats.totalMemories} memories · {demoMode ? `${stats.demoCount} demo` : "all yours"}
              </span>
            }
            hint="Demo memories are fictional and always labeled. Clearing them leaves only your own captures."
          />
          <Row
            icon={<Cloud className="h-4 w-4" />}
            label="Cloud RLS & local backup"
            value={
              <div className="flex items-center gap-2">
                <Chip color={{ color: "text-emerald-300", bg: "bg-emerald-400/10 border border-emerald-400/25" }}>
                  RLS active · {migration?.cloudCounts.memories ?? stats.totalMemories} real
                </Chip>
                {migration?.hasLocalBackup && !migration.claimedByOtherUser && (
                  <Btn variant="ghost" onClick={() => void syncBackup()} disabled={busy !== null}>
                    <RefreshCw className="h-3 w-3" />
                    {busy === "migrate" ? "Syncing…" : "Verify backup"}
                  </Btn>
                )}
              </div>
            }
            hint={
              migration
                ? migration.claimedByCurrentUser
                  ? `Migrated real memories from data/echo-store.json into your cloud account on ${new Date(
                      migration.state?.migratedAt || Date.now()
                    ).toLocaleDateString()}. Local JSON backup is preserved safely.`
                  : migration.claimedByOtherUser
                    ? "Local JSON backup has already been claimed by its original account and is isolated from this account."
                    : migration.hasLocalBackup
                      ? `${migration.localRealMemoryCount} real local memories detected in data/echo-store.json ready to sync.`
                      : "All memories and brain map links are stored in your isolated Supabase PostgreSQL workspace."
                : "Checking cloud synchronization and Row Level Security status…"
            }
          />
        </div>
      </Card>

      <Card title="Capture preferences">
        <div className="space-y-3">
          <Toggle
            checked={profile.settings.demoMode}
            onChange={(v) => updateSettings({ demoMode: v })}
            label="Show demo data"
            description="Blend the fictional sample journal (Alex Rivera, Nov 9–14) into the app. Turning it off instantly shows only your real captures — and your data is never touched."
          />
          <Toggle
            checked={profile.settings.keepTranscripts}
            onChange={(v) => updateSettings({ keepTranscripts: v })}
            label="Keep transcripts"
            description="Store the raw text of each capture so you can revisit exactly what you said."
          />
          <Toggle
            checked={profile.settings.keepAudio}
            onChange={(v) => updateSettings({ keepAudio: v })}
            label="Keep audio recordings"
            description="Default is OFF — audio is transcribed and never written to permanent storage."
          />
        </div>
      </Card>

      <Card title="Data & privacy">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <a href="/api/data" download>
              <Btn>
                <Download className="h-4 w-4" /> Export my data (JSON)
              </Btn>
            </a>
            <Btn
              onClick={() =>
                runAction("transcripts", "Transcript deletion", async () => {
                  await del("/api/data/transcripts");
                })
              }
              disabled={busy !== null}
            >
              <Trash2 className="h-4 w-4" /> Delete all transcripts
            </Btn>
            <Btn
              onClick={() =>
                runAction("reseed", "Demo restore", async () => {
                  await post("/api/seed", { action: "reseed" });
                })
              }
              disabled={busy !== null}
            >
              <RotateCcw className="h-4 w-4" /> Restore demo dataset
            </Btn>
            <Btn
              onClick={() =>
                runAction("clear", "Demo clear", async () => {
                  await post("/api/seed", { action: "clear" });
                })
              }
              disabled={busy !== null}
            >
              <Trash2 className="h-4 w-4" /> Clear all demo data
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (!window.confirm("Erase ALL memories, actions and insights? Demo data will be removed too.")) return;
                void runAction("erase", "Erase all data", async () => {
                  await del("/api/data");
                });
              }}
              disabled={busy !== null}
            >
              <Trash2 className="h-4 w-4" /> Erase all data
            </Btn>
          </div>
        </div>
      </Card>

      <Card title="Danger zone">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
              <UserRound className="h-4 w-4 text-rose-300" /> Delete account & all data
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-dim">
              Permanently erases every memory, transcript, commitment, goal and insight, resets your profile,
              and returns ECHO to the onboarding screen. There is no undo.
            </p>
          </div>
          <Btn variant="danger" onClick={() => void deleteAccount()} disabled={busy !== null}>
            {busy === "delete-account" ? <Spinner className="h-3 w-3" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete everything
          </Btn>
        </div>
      </Card>

      <Card title="About this prototype">
        <div className="space-y-2 text-xs leading-relaxed text-dim">
          <p className="flex items-center gap-2 text-muted">
            <ShieldCheck className="h-4 w-4 text-emerald-soft" /> Recording always requires an explicit tap
            and stops when you press stop or leave the page. There is no covert or background capture.
          </p>
          <p>
            ECHO never invents memories: extraction and chat answers are built strictly from your stored
            transcripts, and insights cite the specific memories that support them.
          </p>
          <p>Vercel-ready: Next.js 15 · React 19 · Tailwind v4 · Supabase · Gemini · React Flow.</p>
        </div>
      </Card>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-fg">
          {icon} {label}
        </span>
        {value}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-dim">{hint}</p>
    </div>
  );
}

function AddInline({ onAdd }: { onAdd: (v: string) => void }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-line-2 px-2 py-1 text-[11px] text-dim transition hover:text-fg"
      >
        + add
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onAdd(value.trim());
            setValue("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-32 rounded-lg border border-line-2 bg-panel-2 px-2 py-1 text-[11px] text-fg focus:border-accent/60 focus:outline-none"
        placeholder="type…"
      />
      <button
        onClick={() => {
          if (value.trim()) {
            onAdd(value.trim());
            setValue("");
            setOpen(false);
          }
        }}
        className="text-emerald-300"
        aria-label="Add"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
