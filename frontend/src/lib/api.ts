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

export interface ForgetPreviewResponse {
  nodes: GraphNode[];
  count: number;
}

export interface ForgetResponse {
  removed_node_ids: string[];
  removed_types: string[];
  removed_count: number;
  forget_event_id: string;
}

export async function previewForget(query: string, topK: number = 20): Promise<ForgetPreviewResponse> {
  const res = await fetch(`${API_BASE}/api/forget/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
  return res.json();
}

export async function executeForget(query: string, reason: string, topK: number = 20): Promise<ForgetResponse> {
  const res = await fetch(`${API_BASE}/api/forget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, reason, top_k: topK }),
  });
  if (!res.ok) throw new Error(`Forget failed: ${res.status}`);
  return res.json();
}
