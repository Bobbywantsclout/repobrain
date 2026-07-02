export type NodeType =
  | "Decision" | "Deprecation" | "Incident" | "Convention"
  | "Commit" | "PullRequest" | "CodeFile" | "Engineer"
  | "ChatSession" | "UserInstruction" | "Correction"
  | "Unknown";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  branch: string;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    total_nodes: number;
    total_edges: number;
    branches: string[];
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function fetchGraph(): Promise<GraphResponse> {
  const res = await fetch(`${API_BASE}/api/graph`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch graph: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
