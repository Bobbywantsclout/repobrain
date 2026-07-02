import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from "d3-force";
import type { GraphNode as ApiNode, GraphEdge as ApiEdge } from "./api";

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
}

interface SimLink {
  source: string;
  target: string;
}

/**
 * Compute a force-directed layout using d3-force.
 * - Connected nodes attract each other via edge springs
 * - All nodes repel each other via many-body force
 * - Collision force prevents overlaps
 * - Weak center gravity keeps things from drifting off-screen
 * - Isolated nodes are gently pulled toward the outer edges
 *   (via forceX/forceY biased outward) so they don't overwhelm the center
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

  // Initialize with deterministic starting positions so the simulation
  // converges consistently across runs
  const simNodes: SimNode[] = nodes.map((n, i) => {
    const isConnected = connectedIds.has(n.id);
    const seed = deterministicSeed(n.id);
    return {
      id: n.id,
      type: n.type,
      // Connected nodes start near center; isolated nodes start on the periphery
      x: isConnected
        ? (seed.x - 0.5) * 100
        : Math.cos(seed.x * Math.PI * 2) * 400,
      y: isConnected
        ? (seed.y - 0.5) * 100
        : Math.sin(seed.y * Math.PI * 2) * 400,
      isConnected,
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
    .force("charge", forceManyBody().strength(-320))
    .force("center", forceCenter(0, 0).strength(0.05))
    .force("collide", forceCollide().radius(38).strength(0.9))
    // Push isolated nodes toward the periphery
    .force(
      "x-isolated",
      forceX((d: any) => (d.isConnected ? 0 : d.x > 0 ? 480 : -480)).strength(
        (d: any) => (d.isConnected ? 0 : 0.08)
      )
    )
    .force(
      "y-isolated",
      forceY((d: any) => (d.isConnected ? 0 : d.y > 0 ? 300 : -300)).strength(
        (d: any) => (d.isConnected ? 0 : 0.08)
      )
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
