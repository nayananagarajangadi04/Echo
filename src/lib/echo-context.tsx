"use client";

import { createContext, useContext } from "react";
import type { DailySummary, Goal, Insight, Memory, Profile, StoreStats } from "@/lib/types";

export type ComputedInsight = {
  key: string;
  title: string;
  body: string;
  evidenceIds: string[];
  metric: string;
  tone: "positive" | "attention" | "neutral";
};

export type EchoBoot = {
  profile: Profile;
  flags: {
    gemini: boolean;
    supabase: boolean;
    storeMode: "local" | "supabase";
    model: string;
    storageWarning?: string | null;
  };
  demoMode: boolean;
  stats: StoreStats;
  score: { score: number; breakdown: Record<string, number> } | null;
  topics: { topic: string; count: number }[];
  goals: Goal[];
  insights: Insight[];
  computed: ComputedInsight[];
  summary: DailySummary | null;
  todayMemories: Memory[];
};

export type EchoContextValue = EchoBoot & {
  refresh: () => Promise<void>;
};

export const EchoContext = createContext<EchoContextValue | null>(null);

export function useEcho(): EchoContextValue {
  const ctx = useContext(EchoContext);
  if (!ctx) throw new Error("useEcho must be used inside AppShell");
  return ctx;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    const err = new Error((data as { error?: string }).error || "Request failed") as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    const err = new Error((data as { error?: string }).error || "Request failed") as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data as T;
}
