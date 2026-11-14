"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import type { ExtractionStatus, MemoryCategory } from "@/lib/types";

export const CATEGORY_META: Record<
  MemoryCategory | "topic",
  { label: string; color: string; bg: string; dot: string }
> = {
  memory: { label: "Memory", color: "text-sky-300", bg: "bg-sky-400/10 border-sky-400/20", dot: "#4cc2ff" },
  person: { label: "Person", color: "text-fuchsia-300", bg: "bg-fuchsia-400/10 border-fuchsia-400/20", dot: "#d78bf2" },
  goal: { label: "Goal", color: "text-violet-300", bg: "bg-violet-400/10 border-violet-400/20", dot: "#9b8cff" },
  decision: { label: "Decision", color: "text-amber-300", bg: "bg-amber-400/10 border-amber-400/20", dot: "#e8b45c" },
  problem: { label: "Problem", color: "text-rose-300", bg: "bg-rose-400/10 border-rose-400/20", dot: "#f2708a" },
  idea: { label: "Idea", color: "text-cyan-300", bg: "bg-cyan-400/10 border-cyan-400/20", dot: "#5adbe8" },
  learning: { label: "Learning", color: "text-emerald-300", bg: "bg-emerald-400/10 border-emerald-400/20", dot: "#46c99b" },
  habit: { label: "Habit", color: "text-orange-300", bg: "bg-orange-400/10 border-orange-400/20", dot: "#ef9a5e" },
  topic: { label: "Topic", color: "text-slate-300", bg: "bg-slate-400/10 border-slate-400/20", dot: "#8b95a8" },
};

export const REL_META: Record<string, { label: string; color: string }> = {
  related_to: { label: "related to", color: "#5d6779" },
  caused_by: { label: "caused by", color: "#e8b45c" },
  followed_by: { label: "followed by", color: "#4cc2ff" },
  contradicts: { label: "contradicts", color: "#f2708a" },
  supports: { label: "supports", color: "#46c99b" },
  shared_topic: { label: "shared topic", color: "#7c6cf6" },
};

export function StatusChip({ status, error }: { status: ExtractionStatus; error?: string | null }) {
  if (status === "analyzed") {
    return (
      <span
        title="Verified — every field was extracted from the transcript"
        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
      >
        <CircleCheck className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span
        title={error || "Transcript saved — awaiting AI analysis"}
        className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
      >
        <CircleDashed className="h-3 w-3" /> Awaiting AI
      </span>
    );
  }
  return (
    <span
      title={error || "AI analysis failed — transcript preserved"}
      className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-300"
    >
      <TriangleAlert className="h-3 w-3" /> Analysis failed
    </span>
  );
}

export function Card({
  children,
  className = "",
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {typeof title === "string" ? (
            <h2 className="micro">{title}</h2>
          ) : (
            title
          )}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Chip({
  children,
  color,
  className = "",
  onClick,
}: {
  children: ReactNode;
  color?: { color: string; bg: string };
  className?: string;
  onClick?: () => void;
}) {
  const cls = color ? `${color.bg} ${color.color}` : "bg-panel-3 text-muted border border-line";
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium ${cls} ${
        onClick ? "hover:brightness-125 cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </Comp>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-line bg-panel px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <span className="micro">{label}</span>
        {icon && <span className="text-dim">{icon}</span>}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-fg-strong">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-dim">{sub}</div>}
    </motion.div>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-2 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-dim">{icon}</div>}
      <div className="text-sm font-medium text-fg">{title}</div>
      <div className="mt-1 max-w-sm text-xs leading-relaxed text-dim">{body}</div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-accent ${className}`}
    />
  );
}

export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = score >= 70 ? "#46c99b" : score >= 50 ? "#9b8cff" : "#e8b45c";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#1d2230" strokeWidth="6" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-fg"
        style={{ fontSize: size * 0.24, fontWeight: 600 }}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-panel-3">
        <div className="h-full rounded-full grad-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-dim">{pct}% confidence</span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-panel-2 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-dim">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-line-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "default",
  className = "",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles: Record<string, string> = {
    default: "bg-panel-3 hover:bg-line-2 text-fg border border-line-2",
    primary: "grad-accent text-white hover:brightness-110 border border-transparent",
    ghost: "text-muted hover:text-fg hover:bg-panel-3 border border-transparent",
    danger: "bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/25",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="micro">{label}</span>
      {hint && <span className="mt-0.5 block text-[11px] text-dim">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-sm text-fg placeholder:text-dim focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40";
