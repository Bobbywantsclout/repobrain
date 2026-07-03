"use client";

import { useEffect } from "react";
import type { GraphNode } from "@/lib/api";
import { NODE_COLORS } from "@/lib/design";

interface Props {
  node: GraphNode | null;
  onClose: () => void;
}

export default function DetailPanel({ node, onClose }: Props) {
  // Escape to close
  useEffect(() => {
    if (!node) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [node, onClose]);

  if (!node) return null;

  const color = NODE_COLORS[node.type] || NODE_COLORS.Unknown;

  // Group attributes into "core" and "metadata"
  const coreFields = pickCoreFields(node).filter(([, val]) => !isEmptyValue(val));
  const metadataFields = Object.entries(node.attributes).filter(
    ([k, val]) =>
      !coreFields.some(([ck]) => ck === k) &&
      !isNoiseField(k) &&
      !isEmptyValue(val)
  );

  return (
    <div
      className="fixed top-0 right-0 h-full z-20 flex flex-col border-l"
      style={{
        width: "380px",
        background: "rgba(15, 22, 36, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: "var(--panel-border)",
        boxShadow: "-8px 0 32px rgba(0, 0, 0, 0.4)",
        animation: "slideIn 250ms ease-out",
      }}
      role="dialog"
      aria-label={`Details for ${node.type}`}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-start justify-between px-5 py-4 border-b"
        style={{ borderColor: "var(--panel-border)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {node.type}
          </span>
          {node.branch && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "var(--panel-bg)",
                color: "var(--text-secondary)",
                border: "1px solid var(--panel-border)",
              }}
            >
              {node.branch}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-lg opacity-60 hover:opacity-100 transition-opacity leading-none"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Close details"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Label */}
        <div className="mb-6">
          <div
            className="text-xs uppercase tracking-wider mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Label
          </div>
          <div
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
            {node.label}
          </div>
        </div>

        {/* Core fields */}
        {coreFields.length > 0 && (
          <div className="mb-6 space-y-4">
            {coreFields.map(([key, val]) => (
              <div key={key}>
                <div
                  className="text-xs uppercase tracking-wider mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatFieldName(key)}
                </div>
                <div
                  className="text-sm leading-relaxed break-words"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatFieldValue(val)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metadata (collapsed by default in future — for now, small text) */}
        {metadataFields.length > 0 && (
          <div>
            <div
              className="text-xs uppercase tracking-wider mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Metadata
            </div>
            <div className="space-y-2">
              {metadataFields.map(([key, val]) => (
                <div key={key} className="flex gap-3 text-xs">
                  <div
                    className="min-w-[80px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatFieldName(key)}
                  </div>
                  <div
                    className="flex-1 break-words"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatFieldValue(val)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helpers

function pickCoreFields(node: GraphNode): [string, unknown][] {
  // Return the fields that carry the primary meaning for each node type
  const attrs = node.attributes;
  const coreByType: Record<string, string[]> = {
    Decision: ["content", "made_on", "made_by_handle", "source_ref"],
    Deprecation: ["what", "why", "replaced_with", "deprecated_on"],
    Incident: ["what_broke", "root_cause", "date"],
    Convention: ["rule", "confidence", "established_on"],
    Commit: ["sha", "message", "author_handle", "timestamp", "branch"],
    PullRequest: ["number", "title", "description", "author_handle", "branch", "merged"],
    CodeFile: ["path", "language", "last_modified", "owner_handle"],
    Engineer: ["name", "github_handle"],
    ChatSession: ["session_id", "tool", "started_at", "project_context"],
    UserInstruction: ["content", "given_at", "scope"],
    Correction: ["ai_suggested", "user_said", "reason", "given_at"],
  };
  const keys = coreByType[node.type] || [];
  return keys
    .filter((k) => attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== "")
    .map((k) => [k, attrs[k]] as [string, unknown]);
}

function isNoiseField(key: string): boolean {
  // Fields we don't want to show — internal Cognee bookkeeping OR redundant with header
  const HIDE_ALWAYS = new Set([
    "id",
    "type",              // shown in header
    "name",              // usually empty for our DataPoints
    "created_at",        // Cognee internal timestamp (Unix ms)
    "updated_at",        // Cognee internal timestamp
    "version",           // Cognee internal
    "ontology_valid",    // implementation detail
    "topological_rank",  // implementation detail
    "metadata",          // raw dict of index_fields — noise
    "belongs_to_set",    // usually empty
    "source_pipeline",   // usually empty
    "source_task",       // usually empty
    "source_node_set",   // usually empty
    "source_user",       // usually empty
    "source_content_hash", // usually null
    "feedback_weight",   // internal weighting
    "importance_weight", // internal weighting
  ]);
  if (HIDE_ALWAYS.has(key)) return true;
  if (key.startsWith("_")) return true;
  return false;
}

function isEmptyValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function formatFieldName(key: string): string {
  return key.replace(/_/g, " ").replace(/^(.)/, (m) => m.toUpperCase());
}

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (Array.isArray(val)) return val.length === 0 ? "—" : val.map((v) => String(v)).join(", ");
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  const str = String(val);
  // Truncate very long values with an ellipsis
  return str.length > 500 ? str.slice(0, 500) + "…" : str;
}
