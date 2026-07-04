"use client";

import { useEffect, useState } from "react";
import { askQuestion, AskResponse, AskSource, Confidence } from "@/lib/api";
import { NODE_COLORS, HEADER_HEIGHT } from "@/lib/design";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  HIGH: "hsl(142, 71%, 50%)",
  MEDIUM: "hsl(48, 96%, 53%)",
  LOW: "var(--text-secondary)",
};

// Mirrors cli/main.py's _format_source_ref — bare "PR #292" / "abc1234" / "unknown source".
function formatSourceRef(node: AskSource): string {
  const linked = (node._linked_node as Record<string, unknown>) || {};
  const relationship = node._relationship as string | undefined;

  if (relationship === "source_commit" && linked.type === "Commit" && linked.sha) {
    return String(linked.sha).slice(0, 7);
  }
  if (relationship === "source_pr" && linked.type === "PullRequest" && linked.number != null) {
    return `PR #${linked.number}`;
  }

  if (node.type === "Convention") {
    const refs = (node.source_refs as string[]) || [];
    if (refs.length === 1) return refs[0];
    if (refs.length > 1) return `${refs.length} sources`;
  }

  const sourceType = node.source_type as string | undefined;
  const sourceRef = node.source_ref as string | undefined;
  if (sourceRef && sourceType === "commit") return sourceRef.slice(0, 7);
  if (sourceRef && sourceType === "pr") return `PR #${sourceRef}`;

  return "unknown source";
}

// Mirrors cli/main.py's _format_branch — "" (not a placeholder) when unknown.
function formatBranch(node: AskSource): string {
  const branch = (node.branch as string) || "";
  if (branch) return branch;
  const linked = (node._linked_node as Record<string, unknown>) || {};
  return (linked.branch as string) || "";
}

// Mirrors cli/main.py's _format_content.
function formatContent(node: AskSource): string {
  switch (node.type) {
    case "Incident":
      return (node.what_broke as string) || "";
    case "Decision":
      return (node.content as string) || "";
    case "Deprecation": {
      const what = (node.what as string) || "";
      const replaced = node.replaced_with as string | undefined;
      return replaced ? `${what} → ${replaced}` : what;
    }
    case "Convention":
      return (node.rule as string) || "";
    case "UserInstruction":
      return (node.content as string) || "";
    case "Correction":
      return `AI suggested '${node.ai_suggested || ""}', user said '${node.user_said || ""}'`;
    default:
      return "";
  }
}

export default function AskPanel({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setBranch("");
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await askQuestion(query, 5, branch.trim() || null);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed left-1/2 z-20 flex flex-col"
      style={{
        top: HEADER_HEIGHT + 16,
        transform: "translateX(-50%)",
        width: "520px",
        maxHeight: "70vh",
        background: "rgba(15, 22, 36, 0.95)",
        backdropFilter: "blur(16px)",
        border: "1px solid var(--panel-border)",
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
      }}
      role="dialog"
      aria-label="Ask a question"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: "hsl(217, 91%, 60%)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Ask a question
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-lg opacity-60 hover:opacity-100 leading-none"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Query input */}
      <div className="mb-3">
        <label
          className="block text-xs uppercase tracking-wider mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Question
        </label>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAsk();
          }}
          placeholder="e.g. what security issues has this project had"
          className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm"
          style={{
            color: "var(--text-primary)",
            borderColor: "var(--panel-border)",
          }}
        />
      </div>

      {/* Branch (optional) */}
      <div className="mb-4">
        <label
          className="block text-xs uppercase tracking-wider mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Branch (optional)
        </label>
        <input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="e.g. main"
          className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm"
          style={{
            color: "var(--text-primary)",
            borderColor: "var(--panel-border)",
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 text-xs" style={{ color: "hsl(0, 84%, 65%)" }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mb-4 overflow-y-auto" style={{ maxHeight: "36vh" }}>
          <div className="mb-3">
            <div
              className="text-xs uppercase tracking-wider mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Answer
            </div>
            <div className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {result.answer}
            </div>
          </div>

          <div className="mb-3 text-xs">
            <span style={{ color: "var(--text-secondary)" }}>Confidence: </span>
            <span style={{ color: CONFIDENCE_COLORS[result.confidence], fontWeight: 600 }}>
              {result.confidence}
            </span>
            <span style={{ color: "var(--text-secondary)" }}> — {result.confidence_reason}</span>
          </div>

          {result.sources.length > 0 && (
            <div className="space-y-2">
              {result.sources.map((node, i) => {
                const color = NODE_COLORS[node.type] || NODE_COLORS.Unknown;
                const branchLabel = formatBranch(node);
                return (
                  <div key={i} className="text-xs">
                    <div style={{ color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--text-secondary)" }}>▸ </span>
                      <span style={{ color, fontWeight: 500 }}>{node.type}</span>
                      <span> · from {formatSourceRef(node)}</span>
                      {branchLabel && <span> · branch: {branchLabel}</span>}
                    </div>
                    <div className="pl-3 mt-0.5" style={{ color: "var(--text-primary)" }}>
                      {formatContent(node)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded transition-colors"
          style={{
            color: "var(--text-secondary)",
            background: "transparent",
          }}
        >
          Close
        </button>
        <button
          onClick={handleAsk}
          disabled={!query.trim() || loading}
          className="px-4 py-2 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            color: "white",
            background: "hsl(217, 91%, 45%)",
          }}
        >
          {loading ? "Asking..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
