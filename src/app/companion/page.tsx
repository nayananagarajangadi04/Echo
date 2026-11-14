"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  Bot,
  Calendar,
  Check,
  ListPlus,
  Menu,
  MessageSquarePlus,
  Search,
  Sparkles,
  StopCircle,
  Trash2,
} from "lucide-react";
import { api, del, post } from "@/lib/client";
import { CompanionMarkdown } from "@/components/CompanionMarkdown";
import { MemoryDrawer } from "@/components/MemoryDrawer";
import { Spinner } from "@/components/ui";
import { stripStreamingArtifacts } from "@/lib/companion-format";
import { useEcho } from "@/lib/echo-context";
import { cn } from "@/lib/cn";
import { dateLabel } from "@/lib/util";
import type { CitationRef, Conversation, ProposedAction } from "@/lib/types";

interface RetrievalMeta {
  memories: number;
  semantic: boolean;
  window: string | null;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: CitationRef[];
  proposedActions: ProposedAction[];
  createdAt: string;
  streaming?: boolean;
  error?: string;
  interrupted?: boolean;
  retrieval?: RetrievalMeta | null;
}

const SUGGESTED: { label: string; q: string }[] = [
  {
    label: "Understand my day",
    q: "Help me understand my day — what happened and what stands out?",
  },
  {
    label: "What am I struggling with?",
    q: "What am I struggling with recently?",
  },
  {
    label: "Find recurring patterns",
    q: "What patterns have you noticed in my recent learning and habits?",
  },
  {
    label: "Review my weekly progress",
    q: "Compare my activities this week with last week. How am I doing?",
  },
  {
    label: "What have I been avoiding?",
    q: "What have I been avoiding?",
  },
  {
    label: "Help me plan tomorrow",
    q: "What should I prioritize tomorrow based on my history?",
  },
];

type StreamEvent =
  | {
      type: "retrieval";
      memories: number;
      semantic: boolean;
      window: string | null;
      catalog?: CitationRef[];
    }
  | { type: "delta"; text: string }
  | {
      type: "done";
      messageId: string;
      content?: string;
      citations: CitationRef[];
      proposedActions: ProposedAction[];
      interrupted?: boolean;
      title?: string | null;
    }
  | { type: "error"; error: string };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return dateLabel(iso.slice(0, 10));
}

function groupConversations(convs: Conversation[]): { label: string; items: Conversation[] }[] {
  const today = new Date().toLocaleDateString("en-CA");
  const yest = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const groups: Record<string, Conversation[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const c of convs) {
    const day = c.updatedAt.slice(0, 10);
    if (day === today) groups.Today.push(c);
    else if (day === yest) groups.Yesterday.push(c);
    else groups.Earlier.push(c);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export default function CompanionPage() {
  const { profile, stats, demoMode, refresh, flags } = useEcho();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamCatalog, setStreamCatalog] = useState<CitationRef[]>([]);
  const [retrievalInfo, setRetrievalInfo] = useState<RetrievalMeta | null>(null);
  const [input, setInput] = useState("");
  const [openMemoryId, setOpenMemoryId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const streamTextRef = useRef("");
  const streamCatalogRef = useRef<CitationRef[]>([]);

  useEffect(() => {
    streamTextRef.current = streamText;
  }, [streamText]);

  useEffect(() => {
    streamCatalogRef.current = streamCatalog;
  }, [streamCatalog]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const name = profile.displayName || profile.fullName || "there";

  const loadConversations = useCallback(async () => {
    try {
      const data = await api<{ conversations: Conversation[] }>("/api/companion/conversations");
      setConversations(data.conversations);
    } catch {
      /* sidebar stays empty */
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
  }, [messages, streamText, streaming]);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setActiveId(id);
    setSidebarOpen(false);
    setLoadingThread(true);
    setMessages([]);
    setStreamText("");
    setStreamCatalog([]);
    setRetrievalInfo(null);
    try {
      const data = await api<{ conversation: Conversation; messages: ChatMsg[] }>(
        `/api/companion/conversations/${id}`
      );
      setMessages(data.messages);
    } catch {
      setMessages([]);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const newConversation = useCallback(async (): Promise<string | null> => {
    try {
      const data = await post<{ conversation: Conversation }>("/api/companion/conversations", {});
      setConversations((prev) => [data.conversation, ...prev]);
      setActiveId(data.conversation.id);
      setMessages([]);
      setStreamText("");
      setStreamCatalog([]);
      setRetrievalInfo(null);
      setSidebarOpen(false);
      return data.conversation.id;
    } catch {
      return null;
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await del(`/api/companion/conversations/${id}`);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          setActiveId(null);
          setMessages([]);
        }
      } catch {
        /* ignore */
      }
    },
    [activeId]
  );

  const finalizeAssistant = useCallback((id: string, patch: Partial<ChatMsg>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch, streaming: false } : m))
    );
  }, []);

  const patchAssistantRetrieval = useCallback((id: string, meta: RetrievalMeta) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, retrieval: meta } : m)));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || streaming) return;
      let convId = activeId;
      if (!convId) {
        convId = await newConversation();
        if (!convId) return;
      }

      const tempUser: ChatMsg = {
        id: `tmp_u_${Date.now()}`,
        role: "user",
        content,
        citations: [],
        proposedActions: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUser]);
      setInput("");
      setStreaming(true);
      setStreamText("");
      setStreamCatalog([]);
      setRetrievalInfo(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const streamId = `tmp_a_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: streamId,
          role: "assistant",
          content: "",
          citations: [],
          proposedActions: [],
          createdAt: new Date().toISOString(),
          streaming: true,
        },
      ]);

      try {
        const res = await fetch(`/api/companion/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let done = false;
        while (!done) {
          const { done: rdDone, value } = await reader.read();
          if (rdDone) break;
          buf += decoder.decode(value, { stream: true });
          const blocks = buf.split("\n\n");
          buf = blocks.pop() || "";
          for (const block of blocks) {
            const line = block.trim();
            if (!line.startsWith("data:")) continue;
            let ev: StreamEvent;
            try {
              ev = JSON.parse(line.slice(5).trim()) as StreamEvent;
            } catch {
              continue;
            }
            if (ev.type === "retrieval") {
              const meta: RetrievalMeta = {
                memories: ev.memories,
                semantic: ev.semantic,
                window: ev.window,
              };
              setRetrievalInfo(meta);
              setStreamCatalog(ev.catalog || []);
              patchAssistantRetrieval(streamId, meta);
            } else if (ev.type === "delta") {
              setStreamText((prev) => prev + ev.text);
            } else if (ev.type === "done") {
              const fallbackCleaned = stripStreamingArtifacts(
                streamTextRef.current,
                streamCatalogRef.current
              );
              finalizeAssistant(streamId, {
                id: ev.messageId,
                content: ev.content ?? fallbackCleaned.content,
                citations: ev.citations,
                proposedActions: ev.proposedActions,
                interrupted: ev.interrupted,
              });
              if (ev.title) {
                const updatedTitle = ev.title;
                setConversations((prev) =>
                  prev.map((c) => (c.id === convId ? { ...c, title: updatedTitle } : c))
                );
              }
              done = true;
            } else if (ev.type === "error") {
              finalizeAssistant(streamId, { error: ev.error });
              done = true;
            }
          }
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) {
          const fallbackCleaned = stripStreamingArtifacts(
            streamTextRef.current,
            streamCatalogRef.current
          );
          finalizeAssistant(streamId, {
            content: fallbackCleaned.content
              ? `${fallbackCleaned.content}\n\n*(Response stopped by you)*`
              : "*(Response stopped by you)*",
            citations: fallbackCleaned.citations,
            streaming: false,
          });
        } else {
          finalizeAssistant(streamId, {
            error: err instanceof Error ? err.message : "Something went wrong",
          });
        }
      } finally {
        setStreaming(false);
        setStreamText("");
        setStreamCatalog([]);
        abortRef.current = null;
        void loadConversations();
      }
    },
    [
      activeId,
      streaming,
      newConversation,
      finalizeAssistant,
      patchAssistantRetrieval,
      loadConversations,
    ]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const addProposedAction = useCallback(
    async (msgId: string, pa: ProposedAction) => {
      if (!activeId) return;
      try {
        await post("/api/companion/actions", {
          conversationId: activeId,
          messageId: msgId,
          title: pa.title,
          dueDate: pa.dueDate,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  proposedActions: m.proposedActions.map((x) =>
                    x.id === pa.id ? { ...x, added: true } : x
                  ),
                }
              : m
          )
        );
        void refresh();
      } catch {
        /* button stays available */
      }
    },
    [activeId, refresh]
  );

  const groups = useMemo(() => groupConversations(conversations), [conversations]);
  const activeTitle = conversations.find((c) => c.id === activeId)?.title;
  const canSend = input.trim().length > 0 && !streaming;

  const sidebar = (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-ink-950/75">
      <div className="p-3">
        <button
          onClick={() => void newConversation()}
          disabled={streaming}
          className="flex w-full items-center justify-center gap-2 rounded-xl grad-accent px-3 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-accent/20 transition hover:brightness-110 disabled:opacity-40"
        >
          <MessageSquarePlus className="h-4 w-4" /> New conversation
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loadingList ? (
          <div className="flex items-center justify-center gap-2 pt-8 text-[11px] text-dim">
            <Spinner className="h-3.5 w-3.5" /> Loading…
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 pt-6 text-center text-[11px] leading-relaxed text-dim">
            No conversations yet.
            <br />
            Ask your first question.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-dim">
                {g.label}
              </div>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg border px-2.5 py-1.5 transition",
                    c.id === activeId
                      ? "border-accent/25 bg-panel-3/90"
                      : "border-transparent hover:bg-panel-2"
                  )}
                >
                  <button
                    onClick={() => void openConversation(c.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div
                      className={cn(
                        "truncate text-[12.5px]",
                        c.id === activeId ? "font-medium text-fg-strong" : "text-fg"
                      )}
                    >
                      {c.isDemo && <span className="mr-1 text-[9px] text-amber-300/80">DEMO</span>}
                      {c.title}
                    </div>
                    <div className="text-[10px] text-dim">{relativeTime(c.updatedAt)} ago</div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteConversation(c.id);
                    }}
                    className="rounded p-1 text-dim opacity-0 transition hover:bg-panel-3 hover:text-red-400 group-hover:opacity-100"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-line px-3.5 py-3 text-[10.5px] leading-relaxed text-dim">
        <div className="font-medium text-muted">
          {stats.totalMemories} memories · {stats.daysCovered} days
        </div>
        Answers are synthesized directly from your saved records.
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-[520px] overflow-hidden rounded-2xl border border-line bg-ink-900/50 md:h-[calc(100vh-6.5rem)]">
      <div className="hidden md:flex">{sidebar}</div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="h-full w-64 bg-ink-950"
              onClick={(e) => e.stopPropagation()}
            >
              {sidebar}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-ink-950/35 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-muted transition hover:bg-panel-2 md:hidden"
              aria-label="Conversations"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-[13px] font-medium text-fg-strong">
              {activeTitle || "ECHO Companion"}
            </span>
            {demoMode && (
              <span className="hidden shrink-0 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300 sm:inline">
                Demo data
              </span>
            )}
          </div>
          <button
            onClick={() => void newConversation()}
            disabled={streaming}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:border-accent/40 hover:text-fg disabled:opacity-40"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
          {messages.length === 0 && !loadingThread && !streaming ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl grad-accent shadow-lg shadow-accent/20">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h1 className="mt-4 text-xl font-bold tracking-tight text-fg-strong sm:text-2xl">
                Hi {name} — ask me anything about your life.
              </h1>
              <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted">
                I retrieve and cross-reference your captured memories before answering, surface patterns
                across days, and link every takeaway back to its source memory.
                {!flags.gemini && " (AI features need GEMINI_API_KEY configured on the server.)"}
              </p>
              <div className="mt-6 grid w-full gap-2.5 sm:grid-cols-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => void send(s.q)}
                    disabled={!flags.gemini}
                    className="group rounded-xl border border-line bg-panel-2/85 px-4 py-3 text-left transition hover:border-accent/40 hover:bg-panel-3 disabled:opacity-40"
                  >
                    <div className="flex items-center gap-2 text-[13px] font-medium text-fg-strong">
                      <Search className="h-3.5 w-3.5 shrink-0 text-accent/80 transition group-hover:text-accent" />
                      {s.label}
                    </div>
                    <div className="mt-1 truncate text-[11.5px] text-dim">{s.q}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {loadingThread && (
                <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-dim">
                  <Spinner className="h-4 w-4" /> Loading conversation…
                </div>
              )}

              {messages.map((m) => {
                const liveStream = m.streaming
                  ? stripStreamingArtifacts(streamText, streamCatalog)
                  : null;
                const displayContent = liveStream ? liveStream.content : m.content;
                const displayCitations =
                  liveStream && liveStream.citations.length > 0
                    ? liveStream.citations
                    : m.citations;

                if (m.role === "user") {
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-row-reverse items-start gap-3"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-3 text-[11px] font-semibold text-fg">
                        {(profile.displayName || profile.fullName || "Y")
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 max-w-[85%] text-right sm:max-w-[78%]">
                        <div className="inline-block whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-accent/25 bg-accent/15 px-4 py-2.5 text-left text-[13.5px] leading-relaxed text-fg-strong">
                          {m.content}
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3"
                  >
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg grad-accent shadow-sm shadow-accent/20">
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </span>

                    <div className="min-w-0 flex-1">
                      {m.error ? (
                        <div className="rounded-2xl rounded-tl-sm border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-left text-[13px] leading-relaxed text-red-200">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-red-300">
                            <AlertTriangle className="h-3.5 w-3.5" /> Something went wrong
                          </div>
                          {m.error}
                          <button
                            onClick={() =>
                              void send(messages[messages.indexOf(m) - 1]?.content || "")
                            }
                            className="mt-2.5 inline-flex items-center rounded-lg border border-red-400/30 px-2.5 py-1 text-[11px] font-medium text-red-200 transition hover:bg-red-500/20"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-2xl rounded-tl-sm border border-line bg-panel px-4 py-4 shadow-sm sm:px-6 sm:py-5">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-2.5">
                            <div className="flex items-center gap-2 text-[11px] font-medium text-muted">
                              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                              <span className="text-fg-strong">ECHO Intelligence</span>
                              {m.streaming && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] text-accent">
                                  · synthesizing
                                </span>
                              )}
                            </div>
                            {(m.retrieval || (m.streaming && retrievalInfo)) && (
                              <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[10px] text-dim">
                                {(m.retrieval || retrievalInfo)!.memories} memories retrieved
                                {(m.retrieval || retrievalInfo)!.window
                                  ? ` · ${(m.retrieval || retrievalInfo)!.window}`
                                  : ""}
                              </span>
                            )}
                          </div>

                          {m.streaming && !displayContent ? (
                            <div className="flex items-center gap-2.5 py-2 text-[12.5px] text-muted">
                              <Spinner className="h-4 w-4 shrink-0 text-accent" />
                              <span>
                                {retrievalInfo
                                  ? `Reviewed ${retrievalInfo.memories} memories${
                                      retrievalInfo.window ? ` from ${retrievalInfo.window}` : ""
                                    }${
                                      retrievalInfo.semantic ? " (semantic match)" : ""
                                    } — structuring insights…`
                                  : "Searching your memories…"}
                              </span>
                            </div>
                          ) : (
                            <CompanionMarkdown
                              content={displayContent}
                              citations={displayCitations}
                              onOpenMemory={setOpenMemoryId}
                            />
                          )}

                          {m.streaming && displayContent && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-dim">
                              <span className="inline-block h-3 w-[2px] animate-pulse bg-accent" />
                              <span>Streaming response…</span>
                            </div>
                          )}

                          {m.interrupted && (
                            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200/90">
                              Response was interrupted — partial result shown.
                            </div>
                          )}

                          {displayCitations.length > 0 && !m.streaming && (
                            <div className="mt-4 border-t border-line/80 pt-3">
                              <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-dim">
                                <BookOpen className="h-3 w-3 text-accent/80" />
                                <span>Referenced memories ({displayCitations.length})</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {displayCitations.map((c, i) => (
                                  <button
                                    key={`${c.memoryId}-${i}`}
                                    type="button"
                                    onClick={() => setOpenMemoryId(c.memoryId)}
                                    title={`${c.title} — ${dateLabel(c.date)}${
                                      c.time ? ` · ${c.time}` : ""
                                    }`}
                                    className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-panel-2/90 px-2.5 py-1.5 text-left text-[11.5px] text-muted transition hover:border-accent/45 hover:bg-panel-3 hover:text-fg-strong"
                                  >
                                    <BookOpen className="h-3 w-3 shrink-0 text-accent/80 transition group-hover:text-accent" />
                                    <span className="truncate font-medium text-fg/90 group-hover:text-fg-strong">
                                      {c.title}
                                    </span>
                                    <span className="shrink-0 text-[10.5px] text-dim">
                                      · {dateLabel(c.date)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {m.proposedActions.length > 0 && (
                            <div className="mt-4 border-t border-line/80 pt-3">
                              <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-dim">
                                <ListPlus className="h-3 w-3 text-accent/80" />
                                <span>Suggested actions</span>
                              </div>
                              <div className="space-y-2">
                                {m.proposedActions.map((pa) => (
                                  <div
                                    key={pa.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3.5 py-2.5"
                                  >
                                    <div className="min-w-0 flex-1 text-[12.5px] text-fg">
                                      <span className="font-medium text-fg-strong">{pa.title}</span>
                                      {pa.dueDate && (
                                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-panel-2/80 px-1.5 py-0.5 text-[10.5px] text-muted">
                                          <Calendar className="h-2.5 w-2.5" />
                                          {dateLabel(pa.dueDate)}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => void addProposedAction(m.id, pa)}
                                      disabled={pa.added}
                                      className={cn(
                                        "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",
                                        pa.added
                                          ? "cursor-default bg-emerald-500/10 text-emerald-300"
                                          : "grad-accent text-white hover:brightness-110"
                                      )}
                                    >
                                      {pa.added ? (
                                        <>
                                          <Check className="h-3 w-3" /> Added to Action Center
                                        </>
                                      ) : (
                                        <>
                                          <ListPlus className="h-3 w-3" /> Add to Action Center
                                        </>
                                      )}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-ink-950/55 px-3 py-3 sm:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-panel-2/90 p-1.5 shadow-sm focus-within:border-accent/50"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="Ask about your memories, commitments, patterns, plans…"
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[13.5px] leading-relaxed text-fg placeholder:text-dim focus:outline-none"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-[12px] font-medium text-red-200 transition hover:bg-red-500/20"
              >
                <StopCircle className="h-4 w-4" /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl grad-accent text-white transition hover:brightness-110 disabled:opacity-35"
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[10.5px] text-dim">
            ECHO cites your captured records directly · Click any source pill to open the original memory
          </p>
        </div>
      </div>

      <MemoryDrawer
        memoryId={openMemoryId}
        onClose={() => setOpenMemoryId(null)}
        onNavigate={(id) => setOpenMemoryId(id)}
      />
    </div>
  );
}
