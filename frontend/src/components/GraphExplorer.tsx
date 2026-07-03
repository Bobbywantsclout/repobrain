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
import { LARGE_NODE_EDGE_THRESHOLD, DIMMED_OPACITY, getNodeSizes } from "@/lib/design";
import type { GraphResponse, GraphNode as ApiNode } from "@/lib/api";

const nodeTypes = {
  graphNode: GraphNode,
};

interface Props {
  data: GraphResponse;
  query: string;
  onNodeClick: (node: ApiNode) => void;
  forgetPreviewIds?: Set<string> | null;
  dissolvingNodeIds?: Set<string> | null;
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

export default function GraphExplorer({
  data,
  query,
  onNodeClick,
  forgetPreviewIds = null,
  dissolvingNodeIds = null,
}: Props) {
  // Count edges per node id to determine "large" nodes
  const edgeCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const edge of data.edges) {
      counts[edge.source] = (counts[edge.source] || 0) + 1;
      counts[edge.target] = (counts[edge.target] || 0) + 1;
    }
    return counts;
  }, [data.edges]);

  // Node sizes scale with graph density — fewer nodes render larger
  const sizes = useMemo(() => getNodeSizes(data.nodes.length), [data.nodes.length]);

  // Compute static layout once (deterministic)
  const layout = useMemo(() => computeLayout(data.nodes, data.edges, sizes.large), [data, sizes.large]);
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

  // Full API node lookup, for click-to-inspect (needs the raw attributes, not
  // the trimmed React Flow node data).
  const nodesById = useMemo(() => {
    const map: Record<string, ApiNode> = {};
    for (const n of data.nodes) map[n.id] = n;
    return map;
  }, [data.nodes]);

  // Set of node ids matching the current query — case-insensitive substring on
  // label, type, or branch. null means "no query active" (no filtering at all),
  // distinct from an empty Set (query active but nothing matched).
  const matchingIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const matches = new Set<string>();
    for (const n of data.nodes) {
      if (
        n.label.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.branch.toLowerCase().includes(q)
      ) {
        matches.add(n.id);
      }
    }
    return matches;
  }, [query, data.nodes]);

  // Build initial React Flow nodes
  const initialNodes: RFNode<GraphNodeData>[] = useMemo(() => {
    return data.nodes.map((n) => {
      const pos = positionById[n.id] || { x: 0, y: 0 };
      const isLarge = (edgeCountById[n.id] || 0) >= LARGE_NODE_EDGE_THRESHOLD;
      // React Flow v11's automatic node-measurement (ResizeObserver-based) never
      // completes under React 19 — nodes stay permanently visibility:hidden and no
      // edges render, since edge paths need known endpoint dimensions. Pre-supplying
      // width/height lets React Flow skip that broken measurement step entirely.
      const size = isLarge ? sizes.large : sizes.base;
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
          isQueryMatch: false,
          isLabelVisible: false,
          isForgetTarget: false,
          isDissolving: false,
          sizeBase: sizes.base,
          sizeLarge: sizes.large,
        },
      };
    });
  }, [data.nodes, positionById, edgeCountById, sizes]);

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
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Reset nodes when data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Update highlight/dim/label-visibility states based on hover AND the active
  // query — a node is dimmed if EITHER the query is active and it doesn't match,
  // OR hover is active and it isn't the hovered node or a neighbor of it. A
  // node's label is visible only when hovered, a neighbor of the hovered node,
  // or a query match — everything else stays a quiet, unlabeled dot.
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const isMatch = matchingIds !== null && matchingIds.has(node.id);
        const queryDimmed = matchingIds !== null && !isMatch;
        const isForgetTarget = forgetPreviewIds !== null && forgetPreviewIds.has(node.id);
        const isDissolving = dissolvingNodeIds !== null && dissolvingNodeIds.has(node.id);

        if (!hoveredId) {
          return {
            ...node,
            data: {
              ...node.data,
              isHighlighted: false,
              isQueryMatch: isMatch,
              isDimmed: queryDimmed,
              isLabelVisible: isMatch,
              isForgetTarget,
              isDissolving,
            },
          };
        }
        const isHovered = node.id === hoveredId;
        const isNeighbor = neighborsById[hoveredId]?.has(node.id) ?? false;
        const hoverDimmed = !isHovered && !isNeighbor;
        return {
          ...node,
          data: {
            ...node.data,
            isHighlighted: isHovered,
            isQueryMatch: isMatch,
            isDimmed: queryDimmed || hoverDimmed,
            isLabelVisible: isHovered || isNeighbor,
            isForgetTarget,
            isDissolving,
          },
        };
      })
    );
  }, [hoveredId, neighborsById, matchingIds, forgetPreviewIds, dissolvingNodeIds, setNodes]);

  // Update edge styling based on the active query — edges between two matching
  // nodes get subtly brighter, edges touching a non-matching node dim to 15%.
  // Edges touching a dissolving node fade to 0 first, ahead of their node (see
  // GraphNode's isDissolving transition), so the connection visibly lets go
  // before the node itself disappears.
  useEffect(() => {
    setEdges((prev) =>
      prev.map((edge) => {
        const isEdgeDissolving =
          dissolvingNodeIds !== null &&
          (dissolvingNodeIds.has(edge.source as string) || dissolvingNodeIds.has(edge.target as string));

        const baseOpacity =
          matchingIds === null
            ? 0.5
            : matchingIds.has(edge.source) && matchingIds.has(edge.target)
            ? 0.9
            : DIMMED_OPACITY;

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: isEdgeDissolving ? 0 : baseOpacity,
            transition: "opacity 600ms ease-out",
          },
        };
      })
    );
  }, [matchingIds, dissolvingNodeIds, setEdges]);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    setHoveredId(node.id);
  }, []);

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredId(null);
  }, []);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const apiNode = nodesById[node.id];
      if (apiNode) onNodeClick(apiNode);
    },
    [nodesById, onNodeClick]
  );

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2, duration: 800 }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: "straight" }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
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
    </div>
  );
}
