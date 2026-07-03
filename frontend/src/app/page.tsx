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

export default function Home() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [forgetMode, setForgetMode] = useState(false);
  const [forgetPreviewIds, setForgetPreviewIds] = useState<Set<string>>(new Set());
  const [dissolvingNodeIds, setDissolvingNodeIds] = useState<Set<string>>(new Set());

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

  const handleForgetComplete = async (removedIds: string[]) => {
    // Start dissolve animation
    setDissolvingNodeIds(new Set(removedIds));
    setForgetPreviewIds(new Set()); // Clear red preview immediately

    // Wait for dissolve animation to complete (~1000ms including edge fade)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Refetch graph (nodes are now gone from backend)
    const fresh = await fetchGraph();
    setData(fresh);
    setDissolvingNodeIds(new Set());
  };

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
            forgetPreviewIds={forgetPreviewIds}
            dissolvingNodeIds={dissolvingNodeIds}
          />
          <QueryBar value={query} onChange={setQuery} />
          <OnboardingHint />
          <DetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
          <ForgetPanel
            isOpen={forgetMode}
            onClose={() => {
              setForgetMode(false);
              setForgetPreviewIds(new Set());
            }}
            onComplete={handleForgetComplete}
            onPreviewChange={setForgetPreviewIds}
          />
        </>
      )}
    </div>
  );
}
