"use client";

import { useEffect, useState } from "react";
import { fetchGraph, GraphResponse, GraphNode } from "@/lib/api";
import GraphExplorer from "@/components/GraphExplorer";
import TopBar from "@/components/TopBar";
import QueryBar from "@/components/QueryBar";
import DetailPanel from "@/components/DetailPanel";
import OnboardingHint from "@/components/OnboardingHint";
import ForgetPanel from "@/components/ForgetPanel";
import "reactflow/dist/style.css";

// Phase 5a: no live preview wiring yet — Phase 5b will replace this with the
// real set of node ids matched by ForgetPanel's debounced preview query.
const EMPTY_FORGET_PREVIEW_IDS = new Set<string>();

export default function Home() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [forgetMode, setForgetMode] = useState(false);

  useEffect(() => {
    fetchGraph()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  // Keyboard shortcut for F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setForgetMode((prev) => !prev);
      }
      if (e.key === "Escape") {
        setForgetMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <TopBar data={data} onForgetClick={() => setForgetMode(true)} />

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
            forgetPreviewIds={EMPTY_FORGET_PREVIEW_IDS}
          />
          <QueryBar value={query} onChange={setQuery} />
          <OnboardingHint />
          <DetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
          <ForgetPanel
            isOpen={forgetMode}
            onClose={() => setForgetMode(false)}
            onComplete={() => {
              // Phase 5a: just refetch the graph
              // Phase 5b: will add dissolve animation before refetch
              fetchGraph().then(setData);
            }}
          />
        </>
      )}
    </div>
  );
}
