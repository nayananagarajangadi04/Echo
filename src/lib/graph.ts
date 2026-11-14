import type { GraphData, GraphEdge, GraphNode, Memory, MemoryRelationship } from "./types";
import { dedupe, hash01 } from "./util";

export function filterMemories(
  memories: Memory[],
  opts: { from?: string; to?: string; categories?: string[]; q?: string }
): Memory[] {
  return memories.filter((m) => {
    if (opts.from && m.date < opts.from) return false;
    if (opts.to && m.date > opts.to) return false;
    if (opts.categories && opts.categories.length > 0 && !opts.categories.includes(m.category)) return false;
    if (opts.q) {
      const q = opts.q.toLowerCase();
      const hay = `${m.title} ${m.summary} ${m.transcript} ${m.topics.join(" ")} ${m.people.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function buildGraph(
  memories: Memory[],
  relationships: MemoryRelationship[],
  opts: { from?: string; to?: string; categories?: string[]; q?: string } = {}
): GraphData {
  const filtered = filterMemories(memories, opts).sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );
  const presentIds = new Set(filtered.map((m) => m.id));

  const nodes: GraphNode[] = filtered.map((m) => ({
    id: m.id,
    kind: "memory" as const,
    label: m.title,
    category: m.category,
    date: m.date,
    time: m.time,
    weight: 1,
    memoryIds: [m.id],
  }));

  const peopleCount = new Map<string, string[]>();
  for (const m of filtered) {
    for (const p of m.people) {
      if (!peopleCount.has(p)) peopleCount.set(p, []);
      peopleCount.get(p)!.push(m.id);
    }
  }
  const topicCount = new Map<string, string[]>();
  for (const m of filtered) {
    for (const t of m.topics) {
      if (!topicCount.has(t)) topicCount.set(t, []);
      topicCount.get(t)!.push(m.id);
    }
  }

  const personNodes: GraphNode[] = [...peopleCount.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([person, ids]) => ({
      id: `person:${person}`,
      kind: "person" as const,
      label: person,
      weight: ids.length,
      memoryIds: dedupe(ids),
    }));

  const topicNodes: GraphNode[] = [...topicCount.entries()]
    .filter(([t, ids]) => {
      const days = new Set(ids.map((id) => filtered.find((m) => m.id === id)?.date));
      return ids.length >= 3 || (ids.length >= 2 && days.size >= 2);
    })
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([topic, ids]) => ({
      id: `topic:${topic}`,
      kind: "topic" as const,
      label: topic,
      weight: ids.length,
      memoryIds: dedupe(ids),
    }));

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, kind: GraphEdge["kind"], sharedTopics: string[] = []) => {
    const key = `${source}|${target}|${kind}`;
    const rkey = `${target}|${source}|${kind}`;
    if (seen.has(key) || seen.has(rkey)) return;
    if (source === target) return;
    seen.add(key);
    edges.push({ id: `e_${seen.size}`, source, target, kind, sharedTopics });
  };

  for (const rel of relationships) {
    if (!presentIds.has(rel.fromId) || !presentIds.has(rel.toId)) continue;
    addEdge(rel.fromId, rel.toId, rel.kind, rel.sharedTopics);
  }

  for (const p of personNodes) {
    const mems = p.memoryIds
      .map((id) => filtered.find((m) => m.id === id))
      .filter(Boolean)
      .sort((a, b) => b!.date.localeCompare(a!.date))
      .slice(0, 8);
    for (const m of mems) addEdge(m!.id, p.id, "related_to");
  }

  for (const t of topicNodes) {
    const mems = t.memoryIds
      .map((id) => filtered.find((m) => m.id === id))
      .filter(Boolean)
      .sort((a, b) => b!.date.localeCompare(a!.date))
      .slice(0, 6);
    for (const m of mems) addEdge(m!.id, t.id, "shared_topic", [t.label]);
  }

  const topicCounts = [...topicCount.entries()]
    .map(([topic, ids]) => ({ topic, count: ids.length }))
    .sort((a, b) => b.count - a.count);
  const peopleCounts = [...peopleCount.entries()]
    .map(([person, ids]) => ({ person, count: ids.length }))
    .sort((a, b) => b.count - a.count);

  return {
    nodes: [...nodes, ...personNodes, ...topicNodes],
    edges,
    meta: {
      memoryCount: nodes.length,
      hubCount: personNodes.length + topicNodes.length,
      edgeCount: edges.length,
      topicCounts: topicCounts.slice(0, 12),
      peopleCounts: peopleCounts.slice(0, 8),
    },
  };
}

export interface XY {
  x: number;
  y: number;
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Map<string, XY> {
  const W = 1100;
  const H = 720;
  const positions = new Map<string, XY>();
  if (nodes.length === 0) return positions;

  const clusterKey = (n: GraphNode) =>
    n.kind === "memory" ? `cat:${n.category}` : n.kind === "person" ? "hub:people" : "hub:topics";

  const clusters = [...new Set(nodes.map(clusterKey))];
  const anchors = new Map<string, XY>();
  clusters.forEach((k, i) => {
    const a = (i / clusters.length) * Math.PI * 2 - Math.PI / 2;
    anchors.set(k, {
      x: W / 2 + Math.cos(a) * W * 0.3,
      y: H / 2 + Math.sin(a) * H * 0.32,
    });
  });

  const idx = new Map<string, number>();
  nodes.forEach((n, i) => idx.set(n.id, i));

  const pos: XY[] = nodes.map((n) => {
    const a = anchors.get(clusterKey(n))!;
    const jx = (hash01(n.id) - 0.5) * 160;
    const jy = (hash01(`${n.id}y`) - 0.5) * 160;
    return { x: a.x + jx, y: a.y + jy };
  });

  const edgesParsed = edges
    .map((e) => [idx.get(e.source), idx.get(e.target)] as [number | undefined, number | undefined])
    .filter((p): p is [number, number] => p[0] !== undefined && p[1] !== undefined);

  const isHub = nodes.map((n) => n.kind !== "memory");
  const minD = nodes.map((n) => (n.kind === "memory" ? 88 : 110));

  const ITER = 240;
  for (let iter = 0; iter < ITER; iter++) {
    const fx = new Array(nodes.length).fill(0);
    const fy = new Array(nodes.length).fill(0);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const d2 = dx * dx + dy * dy + 0.01;
        const d = Math.sqrt(d2);
        const limit = Math.max(minD[i], minD[j]);
        if (d < limit * 2.2) {
          const force = (2600 * (isHub[i] ? 1.3 : 1) * (isHub[j] ? 1.3 : 1)) / d2;
          const ux = dx / d;
          const uy = dy / d;
          fx[i] -= ux * force;
          fy[i] -= uy * force;
          fx[j] += ux * force;
          fy[j] += uy * force;
        }
      }
    }

    for (const [a, b] of edgesParsed) {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = isHub[a] || isHub[b] ? 130 : 170;
      const f = (d - rest) * 0.018;
      const ux = dx / d;
      const uy = dy / d;
      fx[a] += ux * f;
      fy[a] += uy * f;
      fx[b] -= ux * f;
      fy[b] -= uy * f;
    }

    for (let i = 0; i < nodes.length; i++) {
      const a = anchors.get(clusterKey(nodes[i]))!;
      const anchorWeight = isHub[i] ? 0.02 : 0.012;
      fx[i] += (a.x - pos[i].x) * anchorWeight;
      fy[i] += (a.y - pos[i].y) * anchorWeight;
      fx[i] += (W / 2 - pos[i].x) * 0.003;
      fy[i] += (H / 2 - pos[i].y) * 0.003;
    }

    for (let i = 0; i < nodes.length; i++) {
      pos[i].x += fx[i] * 0.5;
      pos[i].y += fy[i] * 0.5;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const sx = (W - 120) / Math.max(1, maxX - minX);
  const sy = (H - 120) / Math.max(1, maxY - minY);
  const scale = Math.min(sx, sy, 1.4);
  nodes.forEach((n, i) => {
    positions.set(n.id, {
      x: (pos[i].x - (minX + maxX) / 2) * scale + W / 2,
      y: (pos[i].y - (minY + maxY) / 2) * scale + H / 2,
    });
  });
  return positions;
}
