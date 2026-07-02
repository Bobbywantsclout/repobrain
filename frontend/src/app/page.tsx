"use client";

import { useEffect, useState } from "react";
import { fetchGraph, GraphResponse } from "@/lib/api";

export default function Home() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGraph()
      .then((graph) => {
        setData(graph);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <p className="text-slate-400">Loading graph...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
        <h1 className="text-2xl font-semibold mb-4">RepoBrain</h1>
        <p className="text-red-400">Error: {error}</p>
        <p className="text-slate-400 mt-4 text-sm">
          Make sure the backend is running: <code className="text-slate-300">uvicorn backend.main:app --reload</code>
        </p>
      </main>
    );
  }

  if (!data) return null;

  const nodeCountsByType: Record<string, number> = {};
  for (const node of data.nodes) {
    nodeCountsByType[node.type] = (nodeCountsByType[node.type] || 0) + 1;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <h1 className="text-3xl font-semibold mb-2">RepoBrain</h1>
      <p className="text-slate-400 mb-8">Graph explorer — Phase 4b (data connection verified)</p>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">Overview</h2>
        <div className="grid grid-cols-3 gap-4 max-w-2xl">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-3xl font-semibold">{data.meta.total_nodes}</div>
            <div className="text-slate-400 text-sm">nodes</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-3xl font-semibold">{data.meta.total_edges}</div>
            <div className="text-slate-400 text-sm">edges</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="text-3xl font-semibold">{data.meta.branches.length}</div>
            <div className="text-slate-400 text-sm">branches</div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">Nodes by type</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-w-3xl">
          {Object.entries(nodeCountsByType).map(([type, count]) => (
            <div key={type} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex justify-between">
              <span className="text-slate-300 text-sm">{type}</span>
              <span className="text-slate-100 font-medium">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">Branches</h2>
        <div className="flex flex-wrap gap-2">
          {data.meta.branches.length === 0 ? (
            <span className="text-slate-500 text-sm italic">No branches identified yet.</span>
          ) : (
            data.meta.branches.map((branch) => (
              <span key={branch} className="bg-purple-950 border border-purple-800 text-purple-200 rounded-full px-3 py-1 text-sm">
                {branch}
              </span>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-4">Sample nodes (first 5)</h2>
        <div className="space-y-2 max-w-3xl">
          {data.nodes.slice(0, 5).map((node) => (
            <div key={node.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-purple-300 text-sm font-medium">{node.type}</span>
                {node.branch && (
                  <span className="text-slate-500 text-xs">branch: {node.branch}</span>
                )}
              </div>
              <div className="text-slate-200">{node.label}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
