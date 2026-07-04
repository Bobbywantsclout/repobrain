import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceRadial } from "d3-force";
import type { GraphNode as ApiNode, GraphEdge as ApiEdge } from "./api";
import { getNodeSize } from "./design";

export interface LayoutedNode {
  id: string;
  x: number;
  y: number;
}

interface SimNode {
  id: string;
  type: string;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
  isConnected: boolean;
  radialTarget: number;
  size: number;
}

interface SimLink {
  source: string;
  target: string;
}

/**
 * Compute a force-directed layout using d3-force.
 * - Connected nodes attract each other via edge springs and repel/collide normally,
 *   forming a compact, legible cluster near the center — the "signal."
 * - Isolated nodes (no edges — most Commits/CodeFiles/Engineers, since only
 *   Decision/Deprecation/Incident/Convention carry a source_commit/source_pr edge)
 *   repel each other weakly and settle onto a soft, radius-varied ring around the
 *   connected cluster via forceRadial — a diffuse background field rather than
 *   foreground content. Each isolated node targets its own radius (550-800px,
 *   derived from a per-node seed) rather than one shared radius, so they don't
 *   read as an artificial perfect circle.
 *
 *   This replaces an earlier version that pulled isolated nodes toward one of 4
 *   fixed quadrant anchor points (±480, ±300) — that produced 4-5 tight, visually
 *   meaningless circular clusters (confirmed via screenshot) since dozens of edgeless
 *   nodes were all converging on the same few anchor coordinates.
 *
 * Simulation runs for a fixed number of ticks (headless), then we take the
 * final positions. This produces a "settled" graph — no live jitter, no
 * ongoing motion after mount.
 */
export function computeLayout(nodes: ApiNode[], edges: ApiEdge[]): LayoutedNode[] {
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const totalNodes = nodes.length;

  // Initialize with deterministic starting positions so the simulation
  // converges consistently across runs
  const simNodes: SimNode[] = nodes.map((n) => {
    const isConnected = connectedIds.has(n.id);
    const seed = deterministicSeed(n.id);
    const radius = 550 + seed.y * 250;
    return {
      id: n.id,
      type: n.type,
      // Connected nodes start near center; isolated nodes start scattered on a
      // radius-varied ring (not a single fixed radius) so the initial layout
      // already reads as diffuse rather than a crisp circle.
      x: isConnected ? (seed.x - 0.5) * 100 : Math.cos(seed.x * Math.PI * 2) * radius,
      y: isConnected ? (seed.y - 0.5) * 100 : Math.sin(seed.x * Math.PI * 2) * radius,
      isConnected,
      radialTarget: radius,
      // Same getNodeSize() the canvas renders with (see design.ts) — collision
      // radius below derives from this per node, so a semantic node's larger
      // true size is exactly what keeps its neighbors from overlapping it,
      // instead of a flat guess that drifts out of sync with actual rendering.
      size: getNodeSize(n.type, totalNodes, !isConnected),
    };
  });

  const simLinks: SimLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  // Build the simulation
  const simulation = forceSimulation(simNodes as any)
    .force(
      "link",
      forceLink(simLinks as any)
        .id((d: any) => d.id)
        .distance(140)
        .strength(0.7)
    )
    // Isolated nodes repel each other much more weakly than connected ones — they're
    // background texture, not content competing for space.
    .force("charge", forceManyBody().strength((d: any) => (d.isConnected ? -320 : -50)))
    .force("center", forceCenter(0, 0).strength(0.05))
    // Radius derived from each node's own true rendered size (half its diameter,
    // plus a little breathing room) rather than one shared guess — so bumping a
    // semantic node's size in design.ts can never make it overlap its neighbors.
    .force(
      "collide",
      forceCollide()
        .radius((d: any) => d.size / 2 + 4)
        .strength(0.9)
    )
    // Each isolated node settles at its own per-node radius (from radialTarget) rather
    // than a single shared one, keeping the background field soft and uneven instead
    // of a crisp ring.
    .force(
      "radial-isolated",
      forceRadial((d: any) => d.radialTarget, 0, 0).strength((d: any) => (d.isConnected ? 0 : 0.06))
    )
    .stop();

  // Run headless simulation — enough ticks to settle
  const TICKS = 400;
  for (let i = 0; i < TICKS; i++) {
    simulation.tick();
  }

  return simNodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
}

// Deterministic seed based on node id — same node always converges to a similar position
function deterministicSeed(id: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const x = ((hash & 0xffff) / 0xffff);
  const y = (((hash >> 16) & 0xffff) / 0xffff);
  return { x, y };
}
