import type { GraphNode as ApiNode, GraphEdge as ApiEdge } from "./api";

export interface LayoutedNode {
  id: string;
  x: number;
  y: number;
}

/**
 * Layout algorithm:
 * 1. Nodes with edges cluster near the center.
 * 2. Isolated nodes (no edges) form a sparse outer ring.
 * 3. Positions are deterministic (seeded by node id) so refreshes don't scramble.
 *
 * This gives a "graph has settled" feel without a live simulation.
 */
export function computeLayout(nodes: ApiNode[], edges: ApiEdge[]): LayoutedNode[] {
  const CENTER_X = 0;
  const CENTER_Y = 0;
  const CONNECTED_RADIUS = 250;
  const ISOLATED_RADIUS = 500;

  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const connected = nodes.filter((n) => connectedIds.has(n.id));
  const isolated = nodes.filter((n) => !connectedIds.has(n.id));

  const layouted: LayoutedNode[] = [];

  // Connected nodes — arrange in inner circle with slight jitter
  connected.forEach((node, i) => {
    const angle = (i / Math.max(connected.length, 1)) * 2 * Math.PI;
    const jitter = deterministicJitter(node.id, 40);
    layouted.push({
      id: node.id,
      x: CENTER_X + Math.cos(angle) * (CONNECTED_RADIUS + jitter.x),
      y: CENTER_Y + Math.sin(angle) * (CONNECTED_RADIUS + jitter.y),
    });
  });

  // Isolated nodes — arrange in outer circle, sparser, with more jitter
  isolated.forEach((node, i) => {
    const angle = (i / Math.max(isolated.length, 1)) * 2 * Math.PI;
    const jitter = deterministicJitter(node.id, 80);
    layouted.push({
      id: node.id,
      x: CENTER_X + Math.cos(angle) * (ISOLATED_RADIUS + jitter.x),
      y: CENTER_Y + Math.sin(angle) * (ISOLATED_RADIUS + jitter.y),
    });
  });

  return layouted;
}

// Cheap deterministic hash-based jitter — same node id always gets same position
function deterministicJitter(id: string, magnitude: number): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const x = ((hash & 0xffff) / 0xffff - 0.5) * magnitude * 2;
  const y = (((hash >> 16) & 0xffff) / 0xffff - 0.5) * magnitude * 2;
  return { x, y };
}
