"use client";

import { Handle, Position, NodeProps } from "reactflow";
import { NODE_COLORS, NODE_SIZE_BASE, NODE_SIZE_LARGE, DIMMED_OPACITY, hasBranchContext } from "@/lib/design";
import type { NodeType } from "@/lib/api";

const FORGET_RED = "hsl(0, 84%, 60%)";

export interface GraphNodeData {
  type: NodeType;
  label: string;
  branch: string;
  isLarge: boolean;
  isDimmed: boolean;
  isHighlighted: boolean;
  isQueryMatch: boolean;
  isLabelVisible: boolean;
  isForgetTarget: boolean;
  isDissolving: boolean;
  sizeBase?: number;
  sizeLarge?: number;
}

export default function GraphNode({ data }: NodeProps<GraphNodeData>) {
  const size = data.isLarge
    ? data.sizeLarge ?? NODE_SIZE_LARGE
    : data.sizeBase ?? NODE_SIZE_BASE;
  const color = NODE_COLORS[data.type] || NODE_COLORS.Unknown;
  const showBranch = hasBranchContext(data.branch);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        opacity: data.isDissolving ? 0 : data.isDimmed ? DIMMED_OPACITY : 1,
        transform: data.isDissolving ? "scale(1.5)" : "scale(1)",
        transition: data.isDissolving
          ? "opacity 800ms ease-out, transform 800ms ease-out"
          : "opacity 150ms, transform 150ms",
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
          border: data.isForgetTarget
            ? `3px solid ${FORGET_RED}`
            : showBranch
            ? "2px solid rgba(255, 255, 255, 0.7)"
            : "none",
          boxShadow: data.isForgetTarget
            ? `0 0 20px ${FORGET_RED}`
            : data.isHighlighted
            ? `0 0 20px ${color}, 0 0 40px ${color}`
            : data.isQueryMatch
            ? `0 0 10px ${color}`
            : "0 2px 8px rgba(0, 0, 0, 0.4)",
          transform: data.isHighlighted ? "scale(1.15)" : "scale(1)",
          transitionDuration: "150ms",
        }}
      />

      {/* Label — hidden by default, revealed only on hover/neighbor/query match */}
      {data.isLabelVisible && (
        <div
          className="absolute pointer-events-none whitespace-nowrap text-center transition-opacity"
          style={{
            top: size + 4,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "11px",
            color: "var(--text-secondary)",
            maxWidth: "180px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transitionDuration: "150ms",
            opacity: 1,
          }}
        >
          {data.label}
        </div>
      )}
    </div>
  );
}
