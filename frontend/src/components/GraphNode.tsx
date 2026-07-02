"use client";

import { Handle, Position, NodeProps } from "reactflow";
import { NODE_COLORS, NODE_SIZE_BASE, NODE_SIZE_LARGE, hasBranchContext } from "@/lib/design";
import type { NodeType } from "@/lib/api";

export interface GraphNodeData {
  type: NodeType;
  label: string;
  branch: string;
  isLarge: boolean;
  isDimmed: boolean;
  isHighlighted: boolean;
}

export default function GraphNode({ data }: NodeProps<GraphNodeData>) {
  const size = data.isLarge ? NODE_SIZE_LARGE : NODE_SIZE_BASE;
  const color = NODE_COLORS[data.type] || NODE_COLORS.Unknown;
  const showBranch = hasBranchContext(data.branch);

  return (
    <div
      className="relative transition-opacity flex items-center justify-center"
      style={{
        opacity: data.isDimmed ? 0.2 : 1,
        transitionDuration: "150ms",
      }}
    >
      {/* Invisible edge-connection handles — required by React Flow */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* The node circle */}
      <div
        className="rounded-full transition-transform"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          border: showBranch ? "2px solid rgba(255, 255, 255, 0.7)" : "none",
          boxShadow: data.isHighlighted
            ? `0 0 20px ${color}, 0 0 40px ${color}`
            : "0 2px 8px rgba(0, 0, 0, 0.4)",
          transform: data.isHighlighted ? "scale(1.15)" : "scale(1)",
          transitionDuration: "150ms",
        }}
      />

      {/* Label — positioned below the node, small, secondary color */}
      <div
        className="absolute pointer-events-none whitespace-nowrap text-center"
        style={{
          top: size + 4,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "11px",
          color: "var(--text-secondary)",
          maxWidth: "180px",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {data.label}
      </div>
    </div>
  );
}
