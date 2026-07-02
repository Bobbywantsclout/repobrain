"use client";

import type { GraphResponse } from "@/lib/api";

interface Props {
  data: GraphResponse | null;
}

export default function TopBar({ data }: Props) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-3 border-b"
      style={{
        background: "rgba(10, 15, 25, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "var(--panel-border)",
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          RepoBrain
        </span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          graph explorer
        </span>
      </div>
      {data && (
        <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span>{data.meta.total_nodes} nodes</span>
          <span>·</span>
          <span>{data.meta.total_edges} edges</span>
          <span>·</span>
          <span>{formatBranches(data.meta.branches)}</span>
        </div>
      )}
    </div>
  );
}

function formatBranches(branches: string[]): string {
  if (branches.length === 0) return "no branches";
  if (branches.length === 1) return branches[0];
  return `${branches[0]} + ${branches.length - 1} branch${branches.length > 2 ? "es" : ""}`;
}
