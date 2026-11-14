import type { Memory, MemoryRelationship } from "./types";
import { isoAt, nowTime, todayISO, uid } from "./util";

export function sharedRelationships(
  memory: Memory,
  others: Memory[],
  max = 3
): MemoryRelationship[] {
  const scored = others
    .filter((o) => o.id !== memory.id)
    .map((o) => {
      const shared = o.topics.filter((t) => memory.topics.includes(t));
      return { o, shared };
    })
    .filter((s) => s.shared.length > 0)
    .sort((a, b) => {
      if (b.shared.length !== a.shared.length) return b.shared.length - a.shared.length;
      return b.o.createdAt.localeCompare(a.o.createdAt);
    })
    .slice(0, max);
  return scored.map((s) => ({
    id: uid("rel"),
    userId: memory.userId,
    fromId: memory.id,
    toId: s.o.id,
    kind: "shared_topic" as const,
    sharedTopics: s.shared,
    createdAt: isoAt(todayISO(), nowTime()),
  }));
}
