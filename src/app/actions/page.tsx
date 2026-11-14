"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  CircleCheck,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, del, patch, post, todayLocal } from "@/lib/client";
import { MemoryChipLink, MemoryDrawer } from "@/components/MemoryDrawer";
import { Btn, Card, Chip, EmptyState, Spinner } from "@/components/ui";
import { dateLabel } from "@/lib/util";
import type { ActionItem, Memory } from "@/lib/types";

type Group = "overdue" | "today" | "upcoming" | "suggested" | "done";

export default function ActionsPage() {
  const [actions, setActions] = useState<ActionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [memoryTitles, setMemoryTitles] = useState<Record<string, { title: string; date: string }>>({});

  const load = useCallback(async () => {
    try {
      const res = await api<{ actions: ActionItem[] }>("/api/actions");
      setActions(res.actions);
      const ids = [...new Set(res.actions.map((a) => a.memoryId).filter(Boolean))] as string[];
      const missing = ids.filter((id) => !(id in memoryTitles));
      if (missing.length > 0) {
        const results = await Promise.all(
          missing.map(async (id) => {
            try {
              const d = await api<{ memory: Memory }>(`/api/memories/${id}`);
              return [id, { title: d.memory.title, date: d.memory.date }] as const;
            } catch {
              return null;
            }
          })
        );
        setMemoryTitles((prev) => {
          const next = { ...prev };
          for (const r of results) if (r) next[r[0]] = r[1];
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load actions");
    }
  }, [memoryTitles]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (a: ActionItem, status: ActionItem["status"]) =>
    mutate(a.id, () => patch(`/api/actions/${a.id}`, { status }));

  const remove = (a: ActionItem) => mutate(a.id, () => del(`/api/actions/${a.id}`));

  const create = async () => {
    if (title.trim().length < 3) return;
    setBusyId("new");
    try {
      await post("/api/actions", { title: title.trim(), dueDate: dueDate || null });
      setTitle("");
      setDueDate("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusyId(null);
    }
  };

  if (!actions && !error) {
    return (
      <div className="flex justify-center p-24">
        <Spinner />
      </div>
    );
  }

  const today = todayLocal();
  const all = actions || [];
  const groups: Record<Group, ActionItem[]> = {
    overdue: all.filter((a) => a.status === "open" && a.dueDate && a.dueDate < today),
    today: all.filter((a) => a.status === "open" && a.dueDate === today),
    upcoming: all.filter(
      (a) => a.status === "open" && (!a.dueDate || a.dueDate > today)
    ),
    suggested: all.filter((a) => a.status === "suggested"),
    done: all.filter((a) => a.status === "done"),
  };

  const GROUP_META: Record<Group, { title: string; hint: string }> = {
    overdue: { title: "Overdue", hint: "past their date — close or consciously drop them" },
    today: { title: "Due today", hint: "" },
    upcoming: { title: "Upcoming", hint: "" },
    suggested: { title: "AI suggestions", hint: "require your approval before becoming commitments" },
    done: { title: "Completed", hint: "" },
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-bold tracking-tight">Action Center</h1>
        </div>
        <Btn variant="primary" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> Add task
        </Btn>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you commit to?"
              className="w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-sm text-fg placeholder:text-dim focus:border-accent/50 focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-dim">
                <CalendarClock className="h-4 w-4" /> Due
              </div>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm text-fg focus:outline-none"
              />
              <div className="ml-auto flex gap-2">
                <Btn variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={create} disabled={title.trim().length < 3 || busyId === "new"}>
                  Create task
                </Btn>
              </div>
            </div>
          </div>
        </Card>
      )}

      {all.length === 0 ? (
        <EmptyState
          title="No action items yet"
          body="Commitments you speak during captures appear here as suggestions awaiting your approval. You can also add tasks manually."
        />
      ) : (
        (Object.keys(groups) as Group[])
          .filter((g) => groups[g].length > 0)
          .map((g) => (
            <Card key={g} title={GROUP_META[g].title}>
              <div className="space-y-2">
                {groups[g].map((a) => {
                  const busy = busyId === a.id;
                  const overdue = g === "overdue";
                  return (
                    <div
                      key={a.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                        overdue
                          ? "border-rose-500/30 bg-rose-500/5"
                          : a.status === "done"
                            ? "border-line bg-panel/60 opacity-70"
                            : "border-line bg-panel-2"
                      }`}
                    >
                      {a.status === "suggested" ? (
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2">
                          <Sparkles className="h-3 w-3 text-accent" />
                        </span>
                      ) : (
                        <button
                          onClick={() => setStatus(a, a.status === "done" ? "open" : "done")}
                          disabled={busy}
                          className="mt-0.5 shrink-0 text-dim transition hover:text-emerald-300 disabled:opacity-40"
                          aria-label={a.status === "done" ? "Reopen" : "Complete"}
                        >
                          {a.status === "done" ? (
                            <CircleCheck className="h-5 w-5 text-emerald-soft" />
                          ) : (
                            <span className="block h-5 w-5 rounded-full border-2 border-line-2" />
                          )}
                        </button>
                      )}

                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium ${
                            a.status === "done" ? "text-dim line-through" : "text-fg"
                          }`}
                        >
                          {a.title}
                        </div>
                        {a.detail && <p className="mt-0.5 text-[11px] text-dim">{a.detail}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {a.dueDate && (
                            <Chip
                              color={
                                overdue
                                  ? { color: "text-rose-300", bg: "bg-rose-400/10 border border-rose-400/25" }
                                  : { color: "text-sky-300", bg: "bg-sky-400/10 border border-sky-400/25" }
                              }
                            >
                              {overdue && <TriangleAlert className="h-3 w-3" />}
                              {overdue ? "was due " : "due "}
                              {dateLabel(a.dueDate)}
                            </Chip>
                          )}
                          <Chip>{a.source === "ai" ? "AI suggested" : a.source === "memory" ? "from memory" : "added by you"}</Chip>
                          {a.memoryId && memoryTitles[a.memoryId] && (
                            <MemoryChipLink
                              id={a.memoryId}
                              title={memoryTitles[a.memoryId].title}
                              date={memoryTitles[a.memoryId].date}
                              onClick={(id) => setOpenId(id)}
                            />
                          )}
                        </div>
                      </div>

                      {a.status === "suggested" ? (
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => setStatus(a, "open")}
                            disabled={busy}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                            aria-label="Approve"
                            title="Approve — becomes a real commitment"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => remove(a)}
                            disabled={busy}
                            className="rounded-lg border border-line bg-panel-3 p-1.5 text-dim hover:text-rose-300 disabled:opacity-40"
                            aria-label="Dismiss"
                            title="Dismiss suggestion"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => remove(a)}
                          disabled={busy}
                          className="shrink-0 rounded-lg border border-line bg-panel-3 p-1.5 text-dim hover:text-rose-300 disabled:opacity-40"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {GROUP_META[g].hint && <p className="mt-3 text-[11px] text-dim">{GROUP_META[g].hint}</p>}
            </Card>
          ))
      )}

      <MemoryDrawer memoryId={openId} onClose={() => setOpenId(null)} onNavigate={(id) => setOpenId(id)} />
    </div>
  );
}
