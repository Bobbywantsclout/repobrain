import type { NodeType } from "./api";

// Node type → HSL color. Chosen for perceptual distinction on dark backgrounds.
export const NODE_COLORS: Record<NodeType, string> = {
  Decision: "hsl(217, 91%, 60%)",         // blue-500
  Deprecation: "hsl(0, 84%, 60%)",        // red-500
  Incident: "hsl(25, 95%, 53%)",          // orange-500
  Convention: "hsl(142, 71%, 45%)",       // green-500
  Commit: "hsl(220, 9%, 46%)",            // gray-500
  PullRequest: "hsl(220, 9%, 65%)",       // gray-400
  CodeFile: "hsl(189, 94%, 43%)",         // cyan-500
  Engineer: "hsl(30, 40%, 50%)",          // amber-600 (brown)
  ChatSession: "hsl(280, 65%, 60%)",      // purple-500 (Cognee aesthetic)
  UserInstruction: "hsl(280, 91%, 65%)",  // purple-400 (Cognee aesthetic)
  Correction: "hsl(48, 96%, 53%)",        // yellow-500
  Unknown: "hsl(220, 9%, 30%)",           // gray-700
};

// Base and large sizes scale slightly with graph density
// Fewer nodes = larger nodes (they should visually fill more space)
// More nodes = compact nodes (they need to fit)
export function getNodeSizes(totalNodes: number): { base: number; large: number } {
  if (totalNodes < 30) return { base: 56, large: 76 };
  if (totalNodes < 80) return { base: 48, large: 66 };  // most common range
  if (totalNodes < 200) return { base: 42, large: 58 };
  return { base: 36, large: 50 };  // very dense
}

export const NODE_SIZE_BASE = 44;   // fallback / minimum
export const NODE_SIZE_LARGE = 60;  // fallback

// A node is "large" if it's referenced by 3+ edges (highly-connected → likely important)
export const LARGE_NODE_EDGE_THRESHOLD = 3;

// A node has "branch context" if its branch field is non-empty
export function hasBranchContext(branch: string): boolean {
  return branch.trim().length > 0;
}

// Muted opacity used when a node is filtered out or unrelated to hover target
export const DIMMED_OPACITY = 0.15;

// Motion durations (ms)
export const MOTION = {
  nodeHover: 150,
  panelSlide: 250,
  simulationDecay: 3500,
};
