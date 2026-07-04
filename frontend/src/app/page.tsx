"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchGraph, GraphResponse, GraphNode } from "@/lib/api";
import GraphExplorer from "@/components/GraphExplorer";
import TopBar from "@/components/TopBar";
import Legend from "@/components/Legend";
import DetailPanel from "@/components/DetailPanel";
import OnboardingHint from "@/components/OnboardingHint";
import ForgetPanel from "@/components/ForgetPanel";
import AskPanel from "@/components/AskPanel";
import IngestPanel from "@/components/IngestPanel";
import { HEADER_HEIGHT } from "@/lib/design";
import "reactflow/dist/style.css";

export default function Home() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [forgetMode, setForgetMode] = useState(false);
  const [askMode, setAskMode] = useState(false);
  const [ingestMode, setIngestMode] = useState(false);
  const [forgetPreviewIds, setForgetPreviewIds] = useState<Set<string>>(new Set());
  const [dissolvingNodeIds, setDissolvingNodeIds] = useState<Set<string>>(new Set());
  const [forgetInitialQuery, setForgetInitialQuery] = useState<string | undefined>(undefined);
  const [isolatedType, setIsolatedType] = useState<string | null>(null);
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);

  // Only one of Forget/Ask/Ingest is open at a time — they share the same on-screen
  // position, so two open simultaneously would overlap.
  const openForget = () => {
    setAskMode(false);
    setIngestMode(false);
    setForgetInitialQuery(undefined);
    setForgetMode(true);
  };
  // Opened from a specific node's detail panel — goes straight to a preview for
  // that node instead of an empty query.
  const openForgetForNode = (label: string) => {
    setAskMode(false);
    setIngestMode(false);
    setForgetInitialQuery(label);
    setForgetMode(true);
  };
  const openAsk = () => {
    setForgetMode(false);
    setForgetPreviewIds(new Set());
    setIngestMode(false);
    setAskMode(true);
  };
  const openIngest = () => {
    setForgetMode(false);
    setForgetPreviewIds(new Set());
    setAskMode(false);
    setIngestMode(true);
  };
  const closeAll = () => {
    setForgetMode(false);
    setForgetPreviewIds(new Set());
    setAskMode(false);
    setIngestMode(false);
  };

  const nodesById = useMemo(() => {
    const map: Record<string, GraphNode> = {};
    for (const n of data?.nodes ?? []) map[n.id] = n;
    return map;
  }, [data]);

  const selectNode = (node: GraphNode) => {
    setPinnedNodeId(null); // fresh node — "Related" must be re-triggered explicitly
    setSelectedNode(node);
  };
  const closeDetail = () => {
    setSelectedNode(null);
    setPinnedNodeId(null);
  };
  const toggleRelated = () => {
    if (!selectedNode) return;
    setPinnedNodeId((prev) => (prev === selectedNode.id ? null : selectedNode.id));
  };
  // Clicking a node's resolved source (e.g. a Decision's source PR) both navigates
  // the detail panel to it AND pins the highlight immediately, so the provenance
  // edge lights up in the graph right as the panel switches — no extra click.
  const selectSourceNode = (node: GraphNode) => {
    setSelectedNode(node);
    setPinnedNodeId(node.id);
  };

  useEffect(() => {
    fetchGraph()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  // Keyboard shortcuts: F (forget), A (ask), I (ingest), Escape (close whichever is open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (forgetMode) closeAll();
        else openForget();
      }
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (askMode) closeAll();
        else openAsk();
      }
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        if (ingestMode) closeAll();
        else openIngest();
      }
      if (e.key === "Escape") {
        closeAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [forgetMode, askMode, ingestMode]);

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
      {/* Single fixed 56px header row: logo, filter, stats, actions — all inline.
          The graph canvas below is offset by this exact HEADER_HEIGHT, so it can
          never overlap graph content regardless of how the force layout happens
          to arrange nodes on a given load. */}
      <div
        className="fixed top-0 left-0 right-0 z-10 border-b"
        style={{
          height: HEADER_HEIGHT,
          background: "rgba(10, 15, 25, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderColor: "var(--panel-border)",
        }}
      >
        <TopBar
          data={data}
          query={query}
          onQueryChange={setQuery}
          onForgetClick={openForget}
          onAskClick={openAsk}
          onIngestClick={openIngest}
        />
      </div>

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
            onNodeClick={selectNode}
            forgetPreviewIds={forgetPreviewIds}
            dissolvingNodeIds={dissolvingNodeIds}
            isolatedType={isolatedType}
            pinnedId={pinnedNodeId}
          />
          <Legend nodes={data.nodes} isolatedType={isolatedType} onIsolate={setIsolatedType} />
          <OnboardingHint />
          <DetailPanel
            node={selectedNode}
            onClose={closeDetail}
            isRelatedActive={!!selectedNode && pinnedNodeId === selectedNode.id}
            onRelatedClick={toggleRelated}
            onForgetClick={openForgetForNode}
            edges={data.edges}
            nodesById={nodesById}
            onSelectSource={selectSourceNode}
          />
          <ForgetPanel
            isOpen={forgetMode}
            onClose={closeAll}
            onComplete={handleForgetComplete}
            onPreviewChange={setForgetPreviewIds}
            initialQuery={forgetInitialQuery}
          />
          <AskPanel isOpen={askMode} onClose={closeAll} />
          <IngestPanel
            isOpen={ingestMode}
            onClose={closeAll}
            onComplete={() => {
              fetchGraph().then(setData);
            }}
          />
        </>
      )}
    </div>
  );
}
