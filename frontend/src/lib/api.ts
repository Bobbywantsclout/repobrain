export type NodeType =
  | "Decision" | "Deprecation" | "Incident" | "Convention"
  | "Commit" | "PullRequest" | "CodeFile" | "Engineer"
  | "ChatSession" | "UserInstruction" | "Correction" | "ForgetEvent"
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

export interface IngestResponse {
  commits: number;
  prs: number;
  files: number;
  decisions: number;
  deprecations: number;
  incidents: number;
  conventions: number;
  branches_ingested: string[];
  commits_per_branch: Record<string, number>;
  prs_per_branch: Record<string, number>;
  total_datapoints: number;
}

export async function ingestRepo(
  repo: string,
  branches: string[] | null = null,
  commits: number = 20,
  prs: number = 10
): Promise<IngestResponse> {
  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo, branches, commits, prs }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Ingest failed: ${res.status}`);
  }
  return res.json();
}

export interface AskSource {
  type: NodeType;
  [key: string]: unknown;
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface AskResponse {
  answer: string;
  confidence: Confidence;
  confidence_reason: string;
  sources: AskSource[];
}

export async function askQuestion(
  query: string,
  topK: number = 5,
  branch: string | null = null
): Promise<AskResponse> {
  const res = await fetch(`${API_BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK, branch }),
  });
  if (!res.ok) throw new Error(`Ask failed: ${res.status}`);
  return res.json();
}
