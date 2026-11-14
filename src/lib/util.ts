import type { Memory } from "./types";

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

export function nowTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function isoAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function dateLabel(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function dateLongLabel(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const STOPWORDS = new Set(
  ("a an the and or but if then else of to in on at for with from by about as is are was were be been being am " +
    "i im ill ive id me my mine you your yours he him his she her it its we us our they them their this that these those there here " +
    "what which who whom when where why how not no nor so too very can will just should now do does did doing done have has had having " +
    "dont cant wont didnt doesnt isnt wasnt arent couldnt shouldnt wouldnt youre thats thats lets shes hes theyre weve heres " +
    "into over under again further once during before after above below out up down off only own same than s t o y re ve ll d m")
    .split(" ")
);

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z][a-z'+-]{2,}/g) || [];
  return raw
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenOverlap(a: string[], bText: string): number {
  const bt = new Set(tokenize(bText));
  return a.reduce((acc, t) => acc + (bt.has(t) ? 1 : 0), 0);
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r.toString().padStart(2, "0")}s` : `${r}s`;
}

export function sortByDateTime(memories: Memory[]): Memory[] {
  return [...memories].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );
}

export function splitSentences(text: string): string[] {
  return (text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]?/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
