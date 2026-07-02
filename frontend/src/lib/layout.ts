import type { GraphNode as ApiNode, GraphEdge as ApiEdge } from "./api";

export interface LayoutedNode {
  id: string;
  x: number;
  y: number;
}

/**
 * Layout algorithm — "gravitational cluster":
 * 1. Connected nodes form a dense center cluster (spiral pack, ~200px radius)
 * 2. Isolated nodes group tightly at the top and bottom edges
 *    (not a symmetric ring — clusters feel less "algorithmic")
 * 3. Positions are deterministic per node id, so the graph doesn't scramble on refresh
 */
export function computeLayout(nodes: ApiNode[], edges: ApiEdge[]): LayoutedNode[] {
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const connected = nodes.filter((n) => connectedIds.has(n.id));
  const isolated = nodes.filter((n) => !connectedIds.has(n.id));

  const layouted: LayoutedNode[] = [];

  // Connected: spiral pack in the center
  const CENTER_RADIUS = 180;
  connected.forEach((node, i) => {
    const angle = i * 2.4; // golden-ratio-ish spiral, feels organic
    const dist = Math.sqrt(i / Math.max(connected.length, 1)) * CENTER_RADIUS;
    const jitter = deterministicJitter(node.id, 15);
    layouted.push({
      id: node.id,
      x: Math.cos(angle) * dist + jitter.x,
      y: Math.sin(angle) * dist + jitter.y,
    });
  });

  // Isolated: split into two tight satellite groups (top + bottom)
  // This avoids the "symmetric ring" look and packs them closer to the center
  const half = Math.ceil(isolated.length / 2);
  const topGroup = isolated.slice(0, half);
  const bottomGroup = isolated.slice(half);

  // Top cluster centered at (0, -380), rectangular grid pack
  packRectGrid(topGroup, layouted, 0, -380, 90);

  // Bottom cluster centered at (0, 380), rectangular grid pack
  packRectGrid(bottomGroup, layouted, 0, 380, 90);

  return layouted;
}

function packRectGrid(
  group: ApiNode[],
  out: LayoutedNode[],
  centerX: number,
  centerY: number,
  spacing: number
) {
  const cols = Math.ceil(Math.sqrt(group.length));
  const rows = Math.ceil(group.length / cols);
  const width = (cols - 1) * spacing;
  const height = (rows - 1) * spacing;
  group.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitter = deterministicJitter(node.id, 12);
    out.push({
      id: node.id,
      x: centerX - width / 2 + col * spacing + jitter.x,
      y: centerY - height / 2 + row * spacing + jitter.y,
    });
  });
}

function deterministicJitter(id: string, magnitude: number): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const x = ((hash & 0xffff) / 0xffff - 0.5) * magnitude * 2;
  const y = (((hash >> 16) & 0xffff) / 0xffff - 0.5) * magnitude * 2;
  return { x, y };
}
