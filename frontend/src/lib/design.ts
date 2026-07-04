import type { NodeType } from "./api";

// Node type → HSL color. Chosen for perceptual distinction on dark backgrounds.
export const NODE_COLORS: Record<NodeType, string> = {
  Incident: "hsl(0, 84%, 60%)",           // red-500 — something went wrong
  Decision: "hsl(25, 95%, 53%)",          // orange-500
  Deprecation: "hsl(217, 91%, 60%)",      // blue-500
  Convention: "hsl(142, 71%, 45%)",       // green-500
  Commit: "hsl(220, 9%, 46%)",            // gray-500
  PullRequest: "hsl(220, 9%, 65%)",       // gray-400
  CodeFile: "hsl(189, 94%, 43%)",         // cyan-500
  Engineer: "hsl(30, 40%, 50%)",          // amber-600 (brown)
  ChatSession: "hsl(280, 65%, 60%)",      // purple-500 (Cognee aesthetic)
  UserInstruction: "hsl(280, 91%, 65%)",  // purple-400 (Cognee aesthetic)
  Correction: "hsl(48, 96%, 53%)",        // yellow-500
  ForgetEvent: "hsl(350, 40%, 42%)",      // muted wine — an audit record of a deletion
  Unknown: "hsl(220, 9%, 30%)",           // gray-700
};

// Base size scales with graph density — fewer nodes render larger (they should
// visually fill more space), more nodes render smaller (they need to fit).
export function getBaseNodeSize(totalNodes: number): number {
  if (totalNodes < 30) return 56;
  if (totalNodes < 80) return 48;   // most common range
  if (totalNodes < 200) return 42;
  return 36;                        // very dense
}

// Background (edgeless) nodes render at this fraction of the base size.
export const BACKGROUND_SIZE_SCALE = 0.55;

// Semantic (signal) nodes render this much bigger than the base size — they're
// the actual product; everything else is scaffolding pointing back to them.
export const SEMANTIC_SIZE_MULTIPLIER = 1.25;

// The extracted-signal types — the actual "memory" content this app produces.
// Everything else (Commit, PullRequest, CodeFile, Engineer, ...) is structural
// scaffolding those signals point back to, not content in its own right.
export const SEMANTIC_TYPES: NodeType[] = [
  "Incident",
  "Decision",
  "Deprecation",
  "Convention",
  "UserInstruction",
  "Correction",
];

export function isSemanticType(type: NodeType): boolean {
  return SEMANTIC_TYPES.includes(type);
}

// Single source of truth for a node's rendered diameter — consumed by both
// GraphExplorer (rendering) and layout.ts (collision force), so the physics
// simulation can never assume a different size than what's actually drawn.
export function getNodeSize(type: NodeType, totalNodes: number, isBackground: boolean): number {
  const base = getBaseNodeSize(totalNodes);
  const resolved = isBackground ? Math.round(base * BACKGROUND_SIZE_SCALE) : base;
  return isSemanticType(type) ? Math.round(resolved * SEMANTIC_SIZE_MULTIPLIER) : resolved;
}

// True if a node of the given type should be considered part of the active
// legend isolation — `null` isolatedType means "no isolation active" (show all).
// The legend isolates one real NodeType at a time (it's generated directly from
// NODE_COLORS, not a hand-picked bucket), so this is a plain equality check.
export function matchesIsolatedType(type: NodeType, isolatedType: string | null): boolean {
  if (!isolatedType) return true;
  return type === isolatedType;
}

// A node has "branch context" if its branch field is non-empty
export function hasBranchContext(branch: string): boolean {
  return branch.trim().length > 0;
}

// Muted opacity used when a node is filtered out or unrelated to hover target
export const DIMMED_OPACITY = 0.15;

// Height of the single fixed header row (logo, search, stats, actions all inline).
// Everything below this — the graph canvas, the legend/hint overlays, and the
// Forget/Ask/Ingest panels' vertical offset — is anchored to this single constant
// so they can't drift out of sync with each other or silently overlap the header.
export const HEADER_HEIGHT = 56;

// Motion durations (ms)
export const MOTION = {
  nodeHover: 150,
  panelSlide: 250,
  simulationDecay: 3500,
};
