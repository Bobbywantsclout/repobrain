"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useUpdateNodeInternals,
  useReactFlow,
  Node as RFNode,
  Edge as RFEdge,
  NodeMouseHandler,
} from "reactflow";
import GraphNode, { GraphNodeData } from "./GraphNode";
import { computeLayout } from "@/lib/layout";
import { LARGE_NODE_EDGE_THRESHOLD, NODE_SIZE_BASE, NODE_SIZE_LARGE } from "@/lib/design";
import type { GraphResponse } from "@/lib/api";

const nodeTypes = {
  graphNode: GraphNode,
};

interface Props {
  data: GraphResponse;
}

// React Flow's automatic node measurement relies on ResizeObserver firing at least
// once per node to compute handle positions (needed for edges) and the fitView bounding
// box. In environments where ResizeObserver never fires, that leaves handles unresolved
// and edges permanently unrendered even after nodes become visible. updateNodeInternals
// recomputes a node's measurements on demand via getBoundingClientRect, independent of
// the observer — this is React Flow's own documented escape hatch for exactly this case,
// not a hack. Must be rendered as a child of <ReactFlow> to access its internal context.
function MeasurementFallback({ nodeIds }: { nodeIds: string[] }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView } = useReactFlow();

  useEffect(() => {
    updateNodeInternals(nodeIds);
    fitView({ padding: 0.2, duration: 800 });
  }, [nodeIds, updateNodeInternals, fitView]);

  return null;
}

export default function GraphExplorer({ data }: Props) {
  // Count edges per node id to determine "large" nodes
  const edgeCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const edge of data.edges) {
      counts[edge.source] = (counts[edge.source] || 0) + 1;
      counts[edge.target] = (counts[edge.target] || 0) + 1;
    }
    return counts;
  }, [data.edges]);

  // Compute static layout once (deterministic)
  const layout = useMemo(() => computeLayout(data.nodes, data.edges), [data]);
  const positionById = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    for (const p of layout) map[p.id] = { x: p.x, y: p.y };
    return map;
  }, [layout]);

  // Compute set of nodes connected to a given node (for hover highlight)
  const neighborsById = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const edge of data.edges) {
      if (!map[edge.source]) map[edge.source] = new Set();
      if (!map[edge.target]) map[edge.target] = new Set();
      map[edge.source].add(edge.target);
      map[edge.target].add(edge.source);
    }
    return map;
  }, [data.edges]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Stable across hover-driven re-renders (unlike `nodes` state), so the
  // MeasurementFallback effect only reruns when the actual node set changes.
  const nodeIds = useMemo(() => data.nodes.map((n) => n.id), [data.nodes]);

  // Build initial React Flow nodes
  const initialNodes: RFNode<GraphNodeData>[] = useMemo(() => {
    return data.nodes.map((n) => {
      const pos = positionById[n.id] || { x: 0, y: 0 };
      const isLarge = (edgeCountById[n.id] || 0) >= LARGE_NODE_EDGE_THRESHOLD;
      // React Flow v11's automatic node-measurement (ResizeObserver-based) never
      // completes under React 19 — nodes stay permanently visibility:hidden and no
      // edges render, since edge paths need known endpoint dimensions. Pre-supplying
      // width/height lets React Flow skip that broken measurement step entirely.
      const size = isLarge ? NODE_SIZE_LARGE : NODE_SIZE_BASE;
      return {
        id: n.id,
        type: "graphNode",
        position: pos,
        width: size,
        height: size,
        data: {
          type: n.type,
          label: n.label,
          branch: n.branch,
          isLarge,
          isDimmed: false,
          isHighlighted: false,
        },
      };
    });
  }, [data.nodes, positionById, edgeCountById]);

  const initialEdges: RFEdge[] = useMemo(() => {
    return data.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "straight",
      style: {
        stroke: "hsl(215, 20%, 40%)",
        strokeWidth: 1.5,
        opacity: 0.5,
      },
      animated: false,
    }));
  }, [data.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Reset nodes when data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Update highlight/dim states based on hover
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        if (!hoveredId) {
          return { ...node, data: { ...node.data, isHighlighted: false, isDimmed: false } };
        }
        const isHovered = node.id === hoveredId;
        const isNeighbor = neighborsById[hoveredId]?.has(node.id) ?? false;
        return {
          ...node,
          data: {
            ...node.data,
            isHighlighted: isHovered,
            isDimmed: !isHovered && !isNeighbor,
          },
        };
      })
    );
  }, [hoveredId, neighborsById, setNodes]);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    setHoveredId(node.id);
  }, []);

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredId(null);
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      fitView
      fitViewOptions={{ padding: 0.2, duration: 800 }}
      minZoom={0.2}
      maxZoom={2}
      defaultEdgeOptions={{ type: "straight" }}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1}
        color="hsl(222, 47%, 15%)"
      />
      <Controls
        position="bottom-right"
        showInteractive={false}
      />
      <MeasurementFallback nodeIds={nodeIds} />
    </ReactFlow>
  );
}
