"use client";

import { useEffect, useState } from "react";
import { fetchGraph, GraphResponse, GraphNode } from "@/lib/api";
import GraphExplorer from "@/components/GraphExplorer";
import TopBar from "@/components/TopBar";
import QueryBar from "@/components/QueryBar";
import DetailPanel from "@/components/DetailPanel";
import OnboardingHint from "@/components/OnboardingHint";
import "reactflow/dist/style.css";

export default function Home() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    fetchGraph()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <TopBar data={data} />

      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: "var(--text-secondary)" }}
        >
          <div className="text-center">
            <p className="text-sm mb-2">Unable to reach RepoBrain backend.</p>
            <p className="text-xs opacity-70">
              Start it with: <code>uvicorn backend.main:app --reload</code>
            </p>
          </div>
        </div>
      )}

      {!error && !data && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: "var(--text-secondary)" }}
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--accent)" }}
          />
        </div>
      )}

      {data && (
        <>
          <GraphExplorer
            data={data}
            query={query}
            onNodeClick={setSelectedNode}
          />
          <QueryBar value={query} onChange={setQuery} />
          <OnboardingHint />
          <DetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        </>
      )}
    </div>
  );
}
