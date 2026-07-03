"use client";

import type { GraphResponse } from "@/lib/api";

interface Props {
  data: GraphResponse | null;
  onForgetClick: () => void;
}

export default function TopBar({ data, onForgetClick }: Props) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-5 border-b"
      style={{
        background: "rgba(10, 15, 25, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "var(--panel-border)",
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          RepoBrain
        </span>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          graph explorer
        </span>
      </div>
      {data && (
        <div className="flex items-center gap-5 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span>{data.meta.total_nodes} nodes</span>
          <span>·</span>
          <span>{data.meta.total_edges} edges</span>
          <span>·</span>
          <span>{formatBranches(data.meta.branches)}</span>
          <button
            onClick={onForgetClick}
            className="text-xs opacity-50 hover:opacity-100 transition-opacity ml-4"
            style={{ color: "var(--text-secondary)" }}
            title="Forget memories (F)"
          >
            forget
          </button>
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
