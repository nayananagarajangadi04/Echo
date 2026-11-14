"use client";

import React from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { normalizeMemoryId } from "@/lib/companion-format";
import type { CitationRef } from "@/lib/types";
import { dateLabel } from "@/lib/util";

interface CompanionMarkdownProps {
  content: string;
  citations: CitationRef[];
  onOpenMemory: (id: string) => void;
}

type ListItemNode = {
  text: string;
  children: BlockNode[];
};

type BlockNode =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; blocks: BlockNode[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItemNode[] }
  | { type: "code"; lang: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" };

function truncateTitle(title: string, max = 26): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  return /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?$/.test(trimmed);
}

function splitTableRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line);
}

function matchListLine(
  line: string
): { indent: number; ordered: boolean; num: number; text: string } | null {
  const ul = line.match(/^(\s*)[-*•]\s+(.*)$/);
  if (ul) {
    return { indent: ul[1].length, ordered: false, num: 0, text: ul[2] };
  }
  const ol = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
  if (ol) {
    return { indent: ol[1].length, ordered: true, num: Number(ol[2]), text: ol[3] };
  }
  return null;
}

function parseListBlock(
  lines: string[],
  startIndex: number
): { node: Extract<BlockNode, { type: "list" }>; nextIndex: number } {
  const first = matchListLine(lines[startIndex])!;
  const baseIndent = first.indent;
  const ordered = first.ordered;
  const start = first.ordered ? first.num || 1 : 1;
  const items: ListItemNode[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // Allow a single blank line between list items only if the next non-blank line continues the same list
      let peek = i + 1;
      while (peek < lines.length && !lines[peek].trim()) peek++;
      const nextMatch = peek < lines.length ? matchListLine(lines[peek]) : null;
      if (nextMatch && nextMatch.indent >= baseIndent) {
        if (nextMatch.indent === baseIndent && nextMatch.ordered !== ordered) break;
        i = peek;
        continue;
      }
      break;
    }

    const matched = matchListLine(line);
    if (matched) {
      if (matched.indent > baseIndent) {
        // Parse nested sub-list belonging to the previous item
        const sub = parseListBlock(lines, i);
        if (items.length > 0) {
          items[items.length - 1].children.push(sub.node);
        } else {
          items.push({ text: "", children: [sub.node] });
        }
        i = sub.nextIndex;
        continue;
      }
      if (matched.indent < baseIndent || matched.ordered !== ordered) {
        break;
      }
      items.push({ text: matched.text.trim(), children: [] });
      i++;
      continue;
    }

    // Continuation lines belonging to current list item
    if (/^\s{2,}\S/.test(line) && items.length > 0) {
      const current = items[items.length - 1];
      current.text = current.text ? `${current.text} ${line.trim()}` : line.trim();
      i++;
      continue;
    }

    break;
  }

  return {
    node: { type: "list", ordered, start, items },
    nextIndex: i,
  };
}

function isBlockStarter(lines: string[], idx: number): boolean {
  const line = lines[idx];
  if (!line.trim()) return true;
  if (/^\s*```/.test(line)) return true;
  if (/^\s*#{1,4}\s+/.test(line)) return true;
  if (/^\s*>/.test(line)) return true;
  if (isHorizontalRule(line)) return true;
  if (matchListLine(line)) return true;
  if (
    line.includes("|") &&
    idx + 1 < lines.length &&
    isTableSeparator(lines[idx + 1])
  ) {
    return true;
  }
  return false;
}

function parseBlocks(markdown: string): BlockNode[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // 1. Fenced code block
    const fence = line.match(/^\s*```([^\s`]*).*$/);
    if (fence) {
      const lang = fence[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // 2. GFM Table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // 3. Heading
    const heading = line.match(/^\s*(#{1,4})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = Math.min(4, Math.max(1, heading[1].length)) as 1 | 2 | 3 | 4;
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      i++;
      continue;
    }

    // 4. Horizontal rule
    if (isHorizontalRule(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // 5. Blockquote
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        blocks: parseBlocks(quoteLines.join("\n")),
      });
      continue;
    }

    // 6. Ordered or unordered list
    if (matchListLine(line)) {
      const parsed = parseListBlock(lines, i);
      blocks.push(parsed.node);
      i = parsed.nextIndex;
      continue;
    }

    // 7. Paragraph
    const paraLines: string[] = [];
    while (i < lines.length && !isBlockStarter(lines, i)) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join(" ") });
    } else {
      i++;
    }
  }

  return blocks;
}

function isSafeHref(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") {
      return u.toString();
    }
  } catch {
    /* invalid URL */
  }
  return null;
}

function InlineCitationChip({
  citation,
  onOpenMemory,
}: {
  citation: CitationRef;
  onOpenMemory: (id: string) => void;
}) {
  const shortDate = dateLabel(citation.date);
  return (
    <button
      type="button"
      onClick={() => onOpenMemory(citation.memoryId)}
      title={`${citation.title} — ${shortDate}${citation.time ? ` · ${citation.time}` : ""}`}
      className="mx-0.5 inline-flex max-w-[235px] items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-1.5 py-[2px] align-baseline text-[11px] font-medium leading-[1.2] text-accent transition hover:border-accent/55 hover:bg-accent/20 hover:text-fg-strong"
    >
      <BookOpen className="h-2.5 w-2.5 shrink-0 opacity-85" />
      <span className="truncate">{truncateTitle(citation.title, 26)}</span>
      {shortDate && <span className="shrink-0 text-[10px] text-dim">· {shortDate}</span>}
    </button>
  );
}

const INLINE_TOKEN_PATTERN =
  "(\\[M:[^\\]]+\\]|\\[\\d+\\]|`[^`\\n]+`|\\[[^\\]]+\\]\\([^)\\s]+\\)|\\*\\*\\*(?!\\s)(?:(?!\\*\\*\\*).)+?(?<!\\s)\\*\\*\\*|\\*\\*(?!\\s)(?:(?!\\*\\*).)+?(?<!\\s)\\*\\*|\\*(?!\\s|\\*)[^*\\n]+?(?<!\\s)\\*|~~(?!\\s)[^~\\n]+?(?<!\\s)~~|(?:^|(?<=[\\s(]))_(?!\\s)[^_\\n]+?(?<!\\s)_(?=$|[\\s).,;:!?]))";

function renderInline(
  text: string,
  citations: CitationRef[],
  onOpenMemory: (id: string) => void,
  keyPrefix = "in",
  depth = 0
): React.ReactNode[] {
  if (!text || depth > 6) return text ? [text] : [];

  const out: React.ReactNode[] = [];
  const re = new RegExp(INLINE_TOKEN_PATTERN, "gi");
  let lastIndex = 0;
  let seq = 0;

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const token = match[0];
    if (token.length === 0) {
      re.lastIndex = match.index + 1;
      continue;
    }
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const key = `${keyPrefix}-${seq++}`;

    // 1. Numbered citation [1]
    const numCite = token.match(/^\[(\d+)\]$/);
    if (numCite) {
      const ref = citations[Number(numCite[1]) - 1];
      if (ref) {
        out.push(
          <InlineCitationChip key={key} citation={ref} onOpenMemory={onOpenMemory} />
        );
      } else {
        out.push(token);
      }
      lastIndex = match.index + token.length;
      continue;
    }

    // 2. Fallback [M:id] if somehow encountered directly
    const rawCite = token.match(/^\[M:\s*([^\]]+?)\s*\]$/i);
    if (rawCite) {
      const cleaned = normalizeMemoryId(rawCite[1]).toLowerCase();
      const ref = citations.find(
        (c) => normalizeMemoryId(c.memoryId).toLowerCase() === cleaned
      );
      if (ref) {
        out.push(
          <InlineCitationChip key={key} citation={ref} onOpenMemory={onOpenMemory} />
        );
      }
      lastIndex = match.index + token.length;
      continue;
    }

    // 3. Inline code
    if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      out.push(
        <code
          key={key}
          className="rounded border border-line bg-panel-3/90 px-1.5 py-[1px] font-mono text-[12px] text-accent-2"
        >
          {token.slice(1, -1)}
        </code>
      );
      lastIndex = match.index + token.length;
      continue;
    }

    // 4. Markdown link [label](url)
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (linkMatch) {
      const safeUrl = isSafeHref(linkMatch[2]);
      if (safeUrl) {
        out.push(
          <a
            key={key}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-accent-2 underline decoration-accent-2/40 underline-offset-2 transition hover:decoration-accent-2"
          >
            {renderInline(linkMatch[1], citations, onOpenMemory, key, depth + 1)}
            <ExternalLink className="h-3 w-3 shrink-0 opacity-75" />
          </a>
        );
      } else {
        out.push(...renderInline(linkMatch[1], citations, onOpenMemory, key, depth + 1));
      }
      lastIndex = match.index + token.length;
      continue;
    }

    // 5. Bold + Italic ***...***
    if (token.startsWith("***") && token.endsWith("***") && token.length > 6) {
      out.push(
        <strong key={key} className="font-semibold text-fg-strong">
          <em className="italic">
            {renderInline(token.slice(3, -3), citations, onOpenMemory, key, depth + 1)}
          </em>
        </strong>
      );
      lastIndex = match.index + token.length;
      continue;
    }

    // 6. Bold **...**
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      out.push(
        <strong key={key} className="font-semibold text-fg-strong">
          {renderInline(token.slice(2, -2), citations, onOpenMemory, key, depth + 1)}
        </strong>
      );
      lastIndex = match.index + token.length;
      continue;
    }

    // 7. Italic *...* or _..._
    if (
      ((token.startsWith("*") && token.endsWith("*")) ||
        (token.startsWith("_") && token.endsWith("_"))) &&
      token.length > 2
    ) {
      out.push(
        <em key={key} className="italic text-fg/90">
          {renderInline(token.slice(1, -1), citations, onOpenMemory, key, depth + 1)}
        </em>
      );
      lastIndex = match.index + token.length;
      continue;
    }

    // 8. Strikethrough ~~...~~
    if (token.startsWith("~~") && token.endsWith("~~") && token.length > 4) {
      out.push(
        <del key={key} className="text-dim line-through">
          {renderInline(token.slice(2, -2), citations, onOpenMemory, key, depth + 1)}
        </del>
      );
      lastIndex = match.index + token.length;
      continue;
    }

    out.push(token);
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out;
}

function renderBlock(
  block: BlockNode,
  citations: CitationRef[],
  onOpenMemory: (id: string) => void,
  key: string
): React.ReactNode {
  switch (block.type) {
    case "heading": {
      if (block.level === 1) {
        return (
          <h1
            key={key}
            className="mb-3 mt-1 border-b border-line pb-2 text-[17px] font-semibold tracking-tight text-fg-strong sm:text-[18px]"
          >
            {renderInline(block.text, citations, onOpenMemory, key)}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2
            key={key}
            className="mb-2 mt-5 text-[15px] font-semibold tracking-tight text-fg-strong"
          >
            {renderInline(block.text, citations, onOpenMemory, key)}
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3
            key={key}
            className="mb-2 mt-4 text-[13.5px] font-semibold tracking-tight text-fg-strong"
          >
            {renderInline(block.text, citations, onOpenMemory, key)}
          </h3>
        );
      }
      return (
        <h4
          key={key}
          className="mb-1.5 mt-3.5 text-[12px] font-semibold uppercase tracking-wider text-muted"
        >
          {renderInline(block.text, citations, onOpenMemory, key)}
        </h4>
      );
    }

    case "paragraph":
      return (
        <p key={key} className="my-2.5 text-[13.5px] leading-[1.7] text-fg/95">
          {renderInline(block.text, citations, onOpenMemory, key)}
        </p>
      );

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-3 rounded-r-lg border-l-2 border-accent/60 bg-panel-2/75 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        >
          {block.blocks.map((child, idx) =>
            renderBlock(child, citations, onOpenMemory, `${key}-bq-${idx}`)
          )}
        </blockquote>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          key={key}
          start={block.ordered && block.start !== 1 ? block.start : undefined}
          className={
            block.ordered
              ? "my-2.5 list-decimal space-y-2 pl-5 text-[13.5px] leading-[1.68] text-fg/95 marker:font-semibold marker:text-accent/90"
              : "my-2.5 list-disc space-y-1.5 pl-5 text-[13.5px] leading-[1.68] text-fg/95 marker:text-accent/75"
          }
        >
          {block.items.map((item, idx) => (
            <li key={`${key}-li-${idx}`} className="pl-1">
              {item.text && (
                <span>{renderInline(item.text, citations, onOpenMemory, `${key}-li-${idx}`)}</span>
              )}
              {item.children.map((sub, subIdx) =>
                renderBlock(sub, citations, onOpenMemory, `${key}-li-${idx}-sub-${subIdx}`)
              )}
            </li>
          ))}
        </Tag>
      );
    }

    case "code":
      return (
        <div
          key={key}
          className="my-3 overflow-hidden rounded-xl border border-line bg-ink-950/85"
        >
          {block.lang && (
            <div className="border-b border-line bg-panel-2/70 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-dim">
              {block.lang}
            </div>
          )}
          <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-fg/90">
            <code>{block.code}</code>
          </pre>
        </div>
      );

    case "table":
      return (
        <div
          key={key}
          className="my-3 overflow-x-auto rounded-xl border border-line bg-panel-2/40"
        >
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-panel-2/90">
                {block.headers.map((h, hIdx) => (
                  <th
                    key={`${key}-th-${hIdx}`}
                    className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {renderInline(h, citations, onOpenMemory, `${key}-th-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {block.rows.map((row, rIdx) => (
                <tr key={`${key}-tr-${rIdx}`} className="transition hover:bg-panel-3/40">
                  {block.headers.map((_, cIdx) => (
                    <td key={`${key}-td-${rIdx}-${cIdx}`} className="px-3.5 py-2 text-fg/90">
                      {renderInline(
                        row[cIdx] ?? "",
                        citations,
                        onOpenMemory,
                        `${key}-td-${rIdx}-${cIdx}`
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr key={key} className="my-4 border-line" />;
  }
}

export function CompanionMarkdown({
  content,
  citations,
  onOpenMemory,
}: CompanionMarkdownProps) {
  const blocks = parseBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className="echo-markdown min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {blocks.map((b, idx) => renderBlock(b, citations, onOpenMemory, `blk-${idx}`))}
    </div>
  );
}
