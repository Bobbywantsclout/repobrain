"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import { DIMMED_OPACITY, getNodeSize, matchesIsolatedType, HEADER_HEIGHT, NODE_COLORS } from "@/lib/design";
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
  isolatedType?: string | null;
  pinnedId?: string | null;
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
    // Less padding than before (0.2 → 0.12) so the graph fills more of the canvas
    // instead of leaving a wide empty margin on every side.
    fitView({ padding: 0.12, duration: 800 });
  }, [nodeIds, updateNodeInternals, fitView]);

  return null;
}

export default function GraphExplorer({
  data,
  query,
  onNodeClick,
  forgetPreviewIds = null,
  dissolvingNodeIds = null,
  isolatedType = null,
  pinnedId = null,
}: Props) {
  // Count edges per node id to determine background (edgeless) nodes
  const edgeCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const edge of data.edges) {
      counts[edge.source] = (counts[edge.source] || 0) + 1;
      counts[edge.target] = (counts[edge.target] || 0) + 1;
    }
    return counts;
  }, [data.edges]);

  // Compute static layout once (deterministic) — sizing (and thus collision
  // radii) comes from design.ts's getNodeSize, the same function used below to
  // size the rendered nodes.
  const layout = useMemo(() => computeLayout(data.nodes, data.edges), [data]);
  const positionById = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    for (const p of layout) map[p.id] = { x: p.x, y: p.y };
    return map;
  }, [layout]);

  // Compute set of nodes connected to a given node (for hover/pinned highlight)
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

  // A hover always wins over a pinned ("Related") node while it's active, but the
  // pin keeps the neighbor highlight alive after the mouse leaves — that's the
  // whole point of pinning it from the detail panel.
  const activeHighlightId = hoveredId ?? pinnedId;

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
    const totalNodes = data.nodes.length;
    return data.nodes.map((n) => {
      const pos = positionById[n.id] || { x: 0, y: 0 };
      const edgeCount = edgeCountById[n.id] || 0;
      // Background nodes (no edges — most Commits/CodeFiles/Engineers, since only
      // semantic nodes carry a source_commit/source_pr edge) render smaller so the
      // connected "signal" nodes read as foreground content instead of being lost
      // among ~100 structural nodes with no extracted relationships. getNodeSize
      // (design.ts) is the single source of truth here — layout.ts's collision
      // force uses the exact same function, so they can never disagree.
      const isBackground = edgeCount === 0;
      const size = getNodeSize(n.type, totalNodes, isBackground);
      // React Flow v11's automatic node-measurement (ResizeObserver-based) never
      // completes under React 19 — nodes stay permanently visibility:hidden and no
      // edges render, since edge paths need known endpoint dimensions. Pre-supplying
      // width/height lets React Flow skip that broken measurement step entirely.
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
          isDimmed: false,
          isHighlighted: false,
          isQueryMatch: false,
          isLabelVisible: false,
          isForgetTarget: false,
          isDissolving: false,
          isBackground,
          size,
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
        // These 21 edges are the actual relationships in the graph — the real
        // signal, not decoration — so they need to read clearly against a near-
        // black background, not blend into it.
        stroke: "hsl(215, 45%, 62%)",
        strokeWidth: 2,
        opacity: 0.75,
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

  // Update highlight/dim/label-visibility states based on hover/pin, the active
  // query, AND the legend's type isolation — a node is dimmed if it fails the
  // active query, fails the active type isolation, or (when something is
  // hovered/pinned) isn't that node or one of its neighbors. A node's label is
  // visible only when it's relevant to one of those active filters — everything
  // else stays a quiet, unlabeled dot.
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const isMatch = matchingIds !== null && matchingIds.has(node.id);
        const queryDimmed = matchingIds !== null && !isMatch;
        const isIsolationMatch = matchesIsolatedType(node.data.type, isolatedType);
        const isolationDimmed = isolatedType !== null && !isIsolationMatch;
        const isForgetTarget = forgetPreviewIds !== null && forgetPreviewIds.has(node.id);
        const isDissolving = dissolvingNodeIds !== null && dissolvingNodeIds.has(node.id);

        if (!activeHighlightId) {
          return {
            ...node,
            data: {
              ...node.data,
              isHighlighted: false,
              isQueryMatch: isMatch,
              isDimmed: queryDimmed || isolationDimmed,
              isLabelVisible: isMatch || (isolatedType !== null && isIsolationMatch),
              isForgetTarget,
              isDissolving,
            },
          };
        }
        const isHovered = node.id === activeHighlightId;
        const isNeighbor = neighborsById[activeHighlightId]?.has(node.id) ?? false;
        const relationDimmed = !isHovered && !isNeighbor;
        return {
          ...node,
          data: {
            ...node.data,
            isHighlighted: isHovered,
            isQueryMatch: isMatch,
            isDimmed: queryDimmed || isolationDimmed || relationDimmed,
            isLabelVisible: isHovered || isNeighbor,
            isForgetTarget,
            isDissolving,
          },
        };
      })
    );
  }, [activeHighlightId, neighborsById, matchingIds, isolatedType, forgetPreviewIds, dissolvingNodeIds, setNodes]);

  // Update edge styling based on the active query and type isolation — edges
  // between two matching/isolated nodes get subtly brighter, edges touching a
  // node that fails either filter dim to 15%. Edges touching a dissolving node
  // fade to 0 first, ahead of their node (see GraphNode's isDissolving
  // transition), so the connection visibly lets go before the node disappears.
  useEffect(() => {
    setEdges((prev) =>
      prev.map((edge) => {
        const isEdgeDissolving =
          dissolvingNodeIds !== null &&
          (dissolvingNodeIds.has(edge.source as string) || dissolvingNodeIds.has(edge.target as string));

        const sourceType = nodesById[edge.source as string]?.type;
        const targetType = nodesById[edge.target as string]?.type;
        const isolationOk =
          isolatedType === null ||
          (sourceType !== undefined &&
            targetType !== undefined &&
            matchesIsolatedType(sourceType, isolatedType) &&
            matchesIsolatedType(targetType, isolatedType));

        const queryOk = matchingIds === null || (matchingIds.has(edge.source) && matchingIds.has(edge.target));

        const baseOpacity = !isolationOk || (matchingIds !== null && !queryOk) ? DIMMED_OPACITY : matchingIds !== null ? 1 : 0.75;

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
  }, [matchingIds, isolatedType, dissolvingNodeIds, nodesById, setEdges]);

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
    // Starts below the fixed header (not just visually covered by it) so fitView
    // computes its bounds against the actual visible area — otherwise nodes could
    // fit into space that's hidden behind the opaque header, throwing off centering.
    <div style={{ position: "fixed", top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0 }}>
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
        fitViewOptions={{ padding: 0.12, duration: 800 }}
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
        <MiniMap
          position="bottom-right"
          pannable={false}
          zoomable={false}
          nodeColor={(n) => NODE_COLORS[(n.data as GraphNodeData).type] || NODE_COLORS.Unknown}
          maskColor="rgba(15, 22, 36, 0.7)"
          // ~30% smaller than React Flow's default (200×150) — this graph only
          // occupies its own corner, not the whole map, so the default size read
          // as oversized for what it needed to show.
          style={{
            width: 140,
            height: 105,
            background: "rgba(15, 22, 36, 0.85)",
            border: "1px solid var(--panel-border)",
            borderRadius: "8px",
          }}
        />
        <MeasurementFallback nodeIds={nodeIds} />
      </ReactFlow>
    </div>
  );
}
