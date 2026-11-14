"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  Link2,
  ListChecks,
  Quote,
  Sparkles,
  Target,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/lib/client";
import { CATEGORY_META, Chip, ConfidenceBar, Spinner, StatusChip } from "@/components/ui";
import { dateLongLabel } from "@/lib/util";
import type { ActionItem, Memory, MemoryRelationship, RelKind } from "@/lib/types";

interface Related {
  rel: MemoryRelationship;
  memory: Memory;
}

interface MemoryResponse {
  memory: Memory;
  related: Related[];
  actions: ActionItem[];
}

const REL_LABEL: Record<RelKind, string> = {
  related_to: "Related to",
  caused_by: "Caused by",
  followed_by: "Followed by",
  contradicts: "Contradicts",
  supports: "Supports",
  shared_topic: "Shared topic",
};

export function MemoryDrawer({
  memoryId,
  onClose,
  onNavigate,
}: {
  memoryId: string | null;
  onClose: () => void;
  onNavigate?: (id: string) => void;
}) {
  const [data, setData] = useState<MemoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (!memoryId) {
      setData(null);
      setError(null);
      setDeleted(false);
      return;
    }
    setLoading(true);
    setError(null);
    api<MemoryResponse>(`/api/memories/${memoryId}`)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [memoryId]);

  async function deleteMemory() {
    if (!memoryId || !data) return;
    try {
      await api(`/api/memories/${memoryId}`, { method: "DELETE" });
      setDeleted(true);
      setTimeout(onClose, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = data ? CATEGORY_META[data.memory.category] : null;

  return (
    <AnimatePresence>
      {memoryId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-ink-900"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-dim">
                Memory details
              </span>
              <button
                onClick={onClose}
                className="rounded-lg border border-line bg-panel-2 p-1.5 text-muted hover:text-fg"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading && (
              <div className="flex flex-1 items-center justify-center">
                <Spinner />
              </div>
            )}
            {error && (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-rose-soft">
                {error}
              </div>
            )}

            {data && meta && (
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip color={meta}>
                    {data.memory.category}
                  </Chip>
                  <StatusChip
                    status={data.memory.extractionStatus}
                    error={data.memory.extractionError}
                  />
                  <span className="text-[11px] text-dim">
                    {dateLongLabel(data.memory.date)} · {data.memory.time}
                  </span>
                  {data.memory.isDemo && (
                    <Chip className="border border-amber-400/30 text-amber-300">demo data</Chip>
                  )}
                  {data.memory.source !== "seed" && (
                    <Chip>{data.memory.source === "voice" ? "voice" : "typed"}</Chip>
                  )}
                </div>

                <h2 className="mt-3 text-xl font-semibold leading-snug text-fg">
                  {data.memory.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{data.memory.summary}</p>

                {data.memory.tone && (
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-dim">
                    <Sparkles className="h-3.5 w-3.5" />
                    Emotional tone: <span className="text-muted">{data.memory.tone}</span>
                  </div>
                )}

                {data.memory.transcript && (
                  <div className="mt-5 rounded-xl border border-line bg-panel p-4">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">
                      <Quote className="h-3.5 w-3.5" /> Transcript
                      <span className="ml-auto font-normal normal-case tracking-normal text-[10px] text-dim">
                        {data.memory.source === "seed"
                          ? "imported from demo data"
                          : data.memory.transcriptProvider === "user-verified"
                            ? "verified by you"
                            : data.memory.transcriptProvider === "typed"
                              ? "typed by you"
                              : data.memory.transcriptProvider}
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted">
                      {data.memory.transcript}
                    </p>
                  </div>
                )}

                {data.memory.topics.length > 0 && (
                  <Section icon={<Brain className="h-3.5 w-3.5" />} title="Topics">
                    <div className="flex flex-wrap gap-1.5">
                      {data.memory.topics.map((t) => (
                        <Chip key={t} color={CATEGORY_META.topic}>{t}</Chip>
                      ))}
                    </div>
                  </Section>
                )}

                {data.memory.people.length > 0 && (
                  <Section icon={<Users className="h-3.5 w-3.5" />} title="People">
                    <div className="flex flex-wrap gap-1.5">
                      {data.memory.people.map((p) => (
                        <Chip key={p} color={CATEGORY_META.person}>
                          <User className="h-3 w-3" /> {p}
                        </Chip>
                      ))}
                    </div>
                  </Section>
                )}

                {data.memory.entities.length > 0 && (
                  <Section icon={<Zap className="h-3.5 w-3.5" />} title="Entities">
                    <div className="flex flex-wrap gap-1.5">
                      {data.memory.entities.map((e) => (
                        <Chip key={e}>{e}</Chip>
                      ))}
                    </div>
                  </Section>
                )}

                {data.memory.commitments.length > 0 && (
                  <ListBlock
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    title="Commitments"
                    items={data.memory.commitments}
                    color="text-emerald-300"
                  />
                )}
                {data.memory.problems.length > 0 && (
                  <ListBlock
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                    title="Problems"
                    items={data.memory.problems}
                    color="text-rose-300"
                  />
                )}
                {data.memory.decisions.length > 0 && (
                  <ListBlock
                    icon={<Zap className="h-3.5 w-3.5" />}
                    title="Decisions"
                    items={data.memory.decisions}
                    color="text-amber-300"
                  />
                )}
                {data.memory.goals.length > 0 && (
                  <ListBlock
                    icon={<Target className="h-3.5 w-3.5" />}
                    title="Goals"
                    items={data.memory.goals}
                    color="text-violet-300"
                  />
                )}
                {data.memory.followUps.length > 0 && (
                  <ListBlock
                    icon={<Clock className="h-3.5 w-3.5" />}
                    title="Follow-ups"
                    items={data.memory.followUps}
                    color="text-sky-300"
                  />
                )}

                <div className="mt-5">
                  <ConfidenceBar value={data.memory.confidence} />
                </div>

                {data.actions.length > 0 && (
                  <Section icon={<ListChecks className="h-3.5 w-3.5" />} title="Linked actions">
                    <div className="space-y-1.5">
                      {data.actions.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs"
                        >
                          <span className="text-muted">{a.title}</span>
                          <Chip
                            color={
                              a.status === "done"
                                ? CATEGORY_META.learning
                                : a.status === "suggested"
                                  ? CATEGORY_META.topic
                                  : CATEGORY_META.decision
                            }
                          >
                            {a.status}
                          </Chip>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {data.related.length > 0 && (
                  <Section icon={<Link2 className="h-3.5 w-3.5" />} title="Connected memories">
                    <div className="space-y-1.5">
                      {data.related.map(({ rel, memory }) => {
                        const rmeta = CATEGORY_META[memory.category];
                        return (
                          <button
                            key={rel.id}
                            onClick={() => onNavigate?.(memory.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-left text-xs transition hover:border-line-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-fg">{memory.title}</span>
                              <span className="text-[10px] text-dim">
                                {memory.date} · {REL_LABEL[rel.kind]}
                                {rel.sharedTopics.length ? ` · ${rel.sharedTopics.join(", ")}` : ""}
                              </span>
                            </span>
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: rmeta.dot }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </Section>
                )}

                <div className="mt-6 border-t border-line pt-4">
                  {deleted ? (
                    <p className="text-center text-xs text-emerald-300">Memory deleted.</p>
                  ) : (
                    <button
                      onClick={() => void deleteMemory()}
                      className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-rose-300/80 transition hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" /> Delete this memory
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function ListBlock({
  icon,
  title,
  items,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  color: string;
}) {
  return (
    <Section icon={icon} title={title}>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className={`flex gap-2 text-[13px] leading-snug ${color}`}>
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" />
            <span className="text-muted">{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function MemoryChipLink({
  id,
  title,
  date,
  onClick,
  icon,
}: {
  id: string;
  title: string;
  date: string;
  onClick: (id: string) => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      title={`${title} (${date})`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel-3 px-2.5 py-1 text-[11px] text-muted transition hover:border-accent/50 hover:text-fg"
    >
      {icon || <BookOpen className="h-3 w-3 shrink-0" />}
      <span className="truncate">{title}</span>
      <span className="shrink-0 text-dim">{date.slice(5)}</span>
    </button>
  );
}
