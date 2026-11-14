"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutGraph } from "@/lib/graph";
import { CATEGORY_META, REL_META } from "@/components/ui";
import type { GraphData, GraphNode, MemoryCategory } from "@/lib/types";
import { dateLabel } from "@/lib/util";

type EchoData = {
  label: string;
  nodeKind: GraphNode["kind"];
  category?: MemoryCategory;
  date?: string;
  count: number;
  dim: boolean;
  selected: boolean;
};

type EchoFlowNode = Node<EchoData, "echo">;

function EchoNode({ data }: NodeProps<EchoFlowNode>) {
  const isMemory = data.nodeKind === "memory";
  const dot = data.category ? CATEGORY_META[data.category].dot : "#94a3b8";
  const colorClass = data.category ? CATEGORY_META[data.category].color : "text-slate-300";

  if (isMemory) {
    return (
      <div
        className="relative flex h-[54px] w-[150px] items-start justify-center"
        style={{ opacity: data.dim ? 0.16 : 1 }}
      >
        <Handle type="target" position={Position.Top} />
        <Handle type="source" position={Position.Bottom} />
        <span
          className={`mt-1.5 block h-[14px] w-[14px] rounded-full transition-all ${
            data.selected ? "ring-4" : ""
          }`}
          style={{
            background: dot,
            boxShadow: `0 0 10px ${dot}66`,
            // @ts-expect-error CSS custom property
            "--tw-ring-color": `${dot}55`,
          }}
        />
        <span className="absolute top-[22px] line-clamp-2 w-[140px] text-center text-[9.5px] leading-tight text-zinc-400">
          {data.label}
        </span>
        {data.date && (
          <span className="absolute -top-2 rounded-full bg-ink-900 px-1 text-[8px] text-zinc-500">
            {dateLabel(data.date)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-[58px] w-[58px] items-center justify-center"
      style={{ opacity: data.dim ? 0.16 : 1 }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
          data.selected ? "scale-110" : ""
        }`}
        style={{
          borderColor: dot,
          background: `${dot}1f`,
          color: dot,
          boxShadow: data.selected ? `0 0 18px ${dot}77` : `0 0 8px ${dot}33`,
          transition: "transform .2s, box-shadow .2s",
        }}
      >
        {data.count}
      </div>
      <span className={`absolute -bottom-1 whitespace-nowrap text-[10px] font-medium ${colorClass}`}>
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { echo: EchoNode };

const NODE_W = { memory: 150, hub: 58 };
const NODE_H = { memory: 54, hub: 58 };

function GraphInner({
  data,
  onSelectMemory,
}: {
  data: GraphData;
  onSelectMemory: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setSelected(null);
    const t = setTimeout(() => fitView({ padding: 0.12, duration: 500 }), 60);
    return () => clearTimeout(t);
  }, [data, fitView]);

  const positions = useMemo(() => layoutGraph(data.nodes, data.edges), [data]);

  const connected = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of data.edges) {
      if (e.source === selected) set.add(e.target);
      if (e.target === selected) set.add(e.source);
    }
    return set;
  }, [selected, data]);

  const nodes: EchoFlowNode[] = useMemo(() => {
    return data.nodes.map((n) => {
      const p = positions.get(n.id) || { x: 0, y: 0 };
      const isMemory = n.kind === "memory";
      const w = isMemory ? NODE_W.memory : NODE_W.hub;
      const h = isMemory ? NODE_H.memory : NODE_H.hub;
      const dim = connected ? !connected.has(n.id) : false;
      return {
        id: n.id,
        type: "echo" as const,
        position: { x: p.x - w / 2, y: p.y - h / 2 },
        data: {
          label: n.label,
          nodeKind: n.kind,
          category: n.category,
          date: n.date,
          count: n.weight,
          dim,
          selected: selected === n.id,
        },
        draggable: true,
        selectable: true,
      };
    });
  }, [data, positions, connected, selected]);

  const edges: Edge[] = useMemo(() => {
    return data.edges.map((e) => {
      const meta = REL_META[e.kind] || REL_META.related_to;
      const dim = connected ? !(connected.has(e.source) && connected.has(e.target)) : false;
      const labeled = ["contradicts", "supports", "caused_by"].includes(e.kind);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "default",
        label: labeled ? meta.label : undefined,
        style: {
          stroke: meta.color,
          strokeWidth: e.kind === "shared_topic" ? 1 : 1.6,
          opacity: dim ? 0.05 : e.kind === "shared_topic" ? 0.35 : 0.7,
        },
        labelStyle: { fill: "#8b93a7", fontSize: 9 },
        labelBgStyle: { fill: "#10131b", fillOpacity: 0.9 },
        animated: e.kind === "contradicts",
      } as Edge;
    });
  }, [data, connected]);

  const onNodeClick = useCallback(
    (_: unknown, node: EchoFlowNode) => {
      const n = data.nodes.find((x) => x.id === node.id);
      if (!n) return;
      setSelected((prev) => (prev === node.id ? null : node.id));
      if (n.kind === "memory") onSelectMemory(n.memoryIds[0]);
    },
    [data, onSelectMemory]
  );

  const onPaneClick = useCallback(() => setSelected(null), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      minZoom={0.2}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: "default" }}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="#1e2331" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

export function GraphCanvas({
  data,
  onSelectMemory,
}: {
  data: GraphData;
  onSelectMemory: (id: string) => void;
}) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <GraphInner data={data} onSelectMemory={onSelectMemory} />
      </ReactFlowProvider>
    </div>
  );
}
