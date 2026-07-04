"use client";

import type { GraphNode, NodeType } from "@/lib/api";
import { NODE_COLORS, isSemanticType, HEADER_HEIGHT } from "@/lib/design";

interface Props {
  nodes: GraphNode[];
  isolatedType: string | null;
  onIsolate: (type: string | null) => void;
}

// Generated directly from NODE_COLORS + live counts, filtered to types actually
// present — not a hand-picked bucket list. A structural type the canvas renders
// (Engineer, CodeFile, ...) can never end up with no matching legend row again,
// because there's no second list to forget to update.
export default function Legend({ nodes, isolatedType, onIsolate }: Props) {
  const counts: Partial<Record<NodeType, number>> = {};
  for (const n of nodes) {
    counts[n.type] = (counts[n.type] || 0) + 1;
  }

  const presentTypes = (Object.keys(NODE_COLORS) as NodeType[]).filter((t) => (counts[t] || 0) > 0);
  const semantic = presentTypes.filter(isSemanticType);
  const structural = presentTypes.filter((t) => !isSemanticType(t)).sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  const rows = [...semantic, ...structural];

  if (rows.length === 0) return null;

  return (
    <div
      className="fixed z-10 flex flex-col gap-1.5 rounded-xl border px-4 py-3 overflow-y-auto"
      style={{
        top: HEADER_HEIGHT + 20,
        left: 20,
        maxHeight: `calc(100vh - ${HEADER_HEIGHT + 40}px)`,
        background: "rgba(15, 22, 36, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "var(--panel-border)",
        minWidth: "190px",
      }}
    >
      <span
        className="text-xs font-medium uppercase tracking-wide pb-1"
        style={{ color: "var(--text-secondary)" }}
      >
        Node types
      </span>
      {rows.map((type) => {
        const active = isolatedType === type;
        const isStructural = !isSemanticType(type);
        return (
          <button
            key={type}
            onClick={() => onIsolate(active ? null : type)}
            className="flex items-center justify-between gap-4 text-sm rounded-md px-1.5 py-1 transition-colors"
            style={{ background: active ? "rgba(255, 255, 255, 0.08)" : "transparent" }}
          >
            <span
              className="flex items-center gap-2"
              style={{ color: "var(--text-primary)", opacity: isStructural ? 0.75 : 1 }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: NODE_COLORS[type] }} />
              {formatTypeLabel(type)}
            </span>
            <span style={{ color: "var(--text-secondary)" }}>{counts[type]}</span>
          </button>
        );
      })}
      <span className="text-xs pt-1" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
        Click a type to isolate
      </span>
    </div>
  );
}

function formatTypeLabel(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}
