"use client";

import type { GraphResponse } from "@/lib/api";
import QueryBar from "./QueryBar";

interface Props {
  data: GraphResponse | null;
  query: string;
  onQueryChange: (value: string) => void;
  onForgetClick: () => void;
  onAskClick: () => void;
  onIngestClick: () => void;
}

interface OutlineButtonProps {
  onClick: () => void;
  title: string;
  label: string;
  hue?: number;
}

// Neutral by default (Ingest) — a quiet outline button. Only Forget carries a hue,
// giving its red identity via border/text color (not a fill), so it's findable
// without ever looking inviting to click.
function OutlineButton({ onClick, title, label, hue }: OutlineButtonProps) {
  const color = hue !== undefined ? `hsl(${hue}, 84%, 65%)` : "var(--text-primary)";
  const borderColor = hue !== undefined ? `hsla(${hue}, 84%, 60%, 0.5)` : "var(--panel-border)";
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors hover:bg-white/5"
      style={{ color, borderColor }}
    >
      {label}
    </button>
  );
}

// Ask is the one thing this app does that isn't a graph-mutating action — the
// single primary, filled button. One primary action per view keeps attention from
// splitting three ways.
function PrimaryButton({ onClick, title, label }: { onClick: () => void; title: string; label: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-sm font-medium px-4 py-1.5 rounded-full transition-transform hover:scale-105"
      style={{ background: "hsl(217, 91%, 60%)", color: "white" }}
    >
      {label}
    </button>
  );
}

// A single 56px row: logo, filter, stats, actions — no second row, no floating
// panel. The graph canvas below only has to clear this one known height.
export default function TopBar({ data, query, onQueryChange, onForgetClick, onAskClick, onIngestClick }: Props) {
  return (
    <div className="flex items-center gap-5 px-6 h-full">
      <span className="text-lg font-semibold tracking-tight shrink-0" style={{ color: "var(--text-primary)" }}>
        RepoBrain
      </span>
      <QueryBar value={query} onChange={onQueryChange} />
      {data && (
        <div className="flex items-center gap-5 ml-auto shrink-0">
          <div className="flex items-center gap-2 text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            <span>{data.meta.total_nodes} nodes</span>
            <span>·</span>
            <span>{data.meta.total_edges} edges</span>
            <span>·</span>
            <span>{formatBranches(data.meta.branches)}</span>
          </div>
          <div className="w-px h-5" style={{ background: "var(--panel-border)" }} />
          <div className="flex items-center gap-2">
            <OutlineButton onClick={onIngestClick} title="Ingest a repo (I)" label="Ingest" />
            <PrimaryButton onClick={onAskClick} title="Ask a question (A)" label="Ask" />
            <OutlineButton onClick={onForgetClick} title="Forget memories (F)" label="Forget" hue={0} />
          </div>
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
