"use client";

import { useEffect, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GraphNode, GraphEdge } from "@/lib/api";
import { NODE_COLORS, HEADER_HEIGHT } from "@/lib/design";

interface Props {
  node: GraphNode | null;
  onClose: () => void;
  isRelatedActive?: boolean;
  onRelatedClick?: () => void;
  onForgetClick?: (label: string) => void;
  edges?: GraphEdge[];
  nodesById?: Record<string, GraphNode>;
  onSelectSource?: (node: GraphNode) => void;
}

export default function DetailPanel({
  node,
  onClose,
  isRelatedActive = false,
  onRelatedClick,
  onForgetClick,
  edges,
  nodesById,
  onSelectSource,
}: Props) {
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

  // The backend truncates node.label to 60 chars for on-canvas display (it has to
  // fit next to a tiny dot). For the ones extracted from a single long text field,
  // prefer that field's full value as the panel's title so it isn't shown once
  // whole (as a "content"-style row) and once cut off (as the title) — the same
  // sentence, twice, is the bug; showing it once, in full, is the fix.
  const fullTextKey = FULL_TEXT_FIELD[node.type];
  const fullText = fullTextKey ? (node.attributes[fullTextKey] as string | undefined) : undefined;
  const displayTitle = fullText && fullText.trim() ? fullText : node.label;

  // Group attributes into "core" and "metadata"
  const redundant = getRedundantFields(node.type);
  const coreFields = pickCoreFields(node)
    .filter(([k]) => !redundant.has(k))
    .filter(([, val]) => !isEmptyValue(val))
    .filter(([k]) => !SOURCE_KEYS.has(k));
  const metadataFields = Object.entries(node.attributes).filter(
    ([k, val]) =>
      !coreFields.some(([ck]) => ck === k) &&
      !redundant.has(k) &&
      !isNoiseField(k) &&
      !isEmptyValue(val) &&
      !SOURCE_KEYS.has(k)
  );

  // FROM / SOURCE TYPE used to render as two separate rows ("288" / "pr"). Merged
  // into one "Source · PR #288" row, and — when the provenance edge resolves to an
  // actual node in the graph — clickable, so provenance (the whole pitch) is
  // something a viewer can click through, not just read.
  const sourceType = node.attributes["source_type"] as string | undefined;
  const sourceRef = node.attributes["source_ref"] as string | undefined;
  const sourceEdge = edges?.find(
    (e) => e.source === node.id && (e.relationship === "source_pr" || e.relationship === "source_commit")
  );
  const sourceApiNode = sourceEdge && nodesById ? nodesById[sourceEdge.target] : undefined;
  const sourceLabel =
    sourceType === "pr" && sourceRef
      ? `PR #${sourceRef}`
      : sourceType === "commit" && sourceRef
      ? `Commit ${sourceRef.slice(0, 10)}`
      : undefined;

  return (
    <div
      className="fixed right-0 z-20 flex flex-col border-l"
      style={{
        top: HEADER_HEIGHT,
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
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
        {/* Title — full text, wraps as needed (no separate truncated + full pair) */}
        <div className="mb-5">
          <div
            className="text-base leading-snug"
            style={{ color: "var(--text-primary)", fontWeight: 500 }}
          >
            <InlineCode text={displayTitle} />
          </div>
        </div>

        {/* Source — merged from source_type + source_ref, clickable when the
            provenance edge resolves to an actual node */}
        {sourceLabel && (
          <div className="flex gap-4 text-sm mb-3">
            <div
              className="min-w-[80px] flex-shrink-0 text-xs uppercase tracking-wider pt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Source
            </div>
            <div className="flex-1 break-words leading-relaxed overflow-hidden">
              {sourceApiNode && onSelectSource ? (
                <button
                  onClick={() => onSelectSource(sourceApiNode)}
                  className="text-left hover:underline"
                  style={{ color: "var(--text-primary)" }}
                >
                  {sourceLabel}
                </button>
              ) : (
                <span style={{ color: "var(--text-primary)" }}>{sourceLabel}</span>
              )}
            </div>
          </div>
        )}

        {/* Core fields */}
        {coreFields.length > 0 && (
          <div className="space-y-3">
            {coreFields.map(([key, val]) => (
              <div key={key} className="flex gap-4 text-sm">
                <div
                  className="min-w-[80px] flex-shrink-0 text-xs uppercase tracking-wider pt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatFieldName(key)}
                </div>
                <div
                  className="flex-1 break-words leading-relaxed overflow-hidden"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatFieldValue(val, key)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metadata — compact two-column layout matching core fields */}
        {metadataFields.length > 0 && (
          <div className="space-y-3 mt-3">
            {metadataFields.map(([key, val]) => (
              <div key={key} className="flex gap-4 text-sm">
                <div
                  className="min-w-[80px] flex-shrink-0 text-xs uppercase tracking-wider pt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatFieldName(key)}
                </div>
                <div
                  className="flex-1 break-words leading-relaxed overflow-hidden"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatFieldValue(val, key)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions — a read-only panel is a dead end; these link straight
          into the graph's two other interactions from the exact node being
          inspected. */}
      {(onRelatedClick || onForgetClick) && (
        <div
          className="flex items-center gap-2 px-5 py-4 border-t"
          style={{ borderColor: "var(--panel-border)" }}
        >
          {onRelatedClick && (
            <button
              onClick={onRelatedClick}
              className="text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors hover:bg-white/5"
              style={{
                color: isRelatedActive ? "var(--text-primary)" : "var(--text-secondary)",
                borderColor: "var(--panel-border)",
                background: isRelatedActive ? "rgba(255, 255, 255, 0.08)" : "transparent",
              }}
            >
              Related
            </button>
          )}
          {onForgetClick && (
            <button
              onClick={() => onForgetClick(node.label)}
              className="text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors hover:bg-white/5"
              style={{ color: "hsl(0, 84%, 65%)", borderColor: "hsla(0, 84%, 60%, 0.5)" }}
            >
              Forget…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Helpers

// Node type → the attribute holding its full, untruncated text. The panel's
// title prefers this over node.label (see displayTitle above).
const FULL_TEXT_FIELD: Partial<Record<string, string>> = {
  Decision: "content",
  Deprecation: "what",
  Incident: "what_broke",
  Convention: "rule",
  ForgetEvent: "reason",
};

// Rendered as a single merged "Source" row instead of two generic ones.
const SOURCE_KEYS = new Set(["source_ref", "source_type"]);

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
    ForgetEvent: ["reason", "query", "removed_types", "removed_count", "forgotten_at"],
  };
  const keys = coreByType[node.type] || [];
  return keys
    .filter((k) => attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== "")
    .map((k) => [k, attrs[k]] as [string, unknown]);
}

function getRedundantFields(nodeType: string): Set<string> {
  // Fields whose value is identical to (or a superset of) the header label
  const map: Record<string, string[]> = {
    PullRequest: ["title"],       // title is what generates the label
    Commit: ["message"],           // message is what generates the label
    Decision: ["content"],         // content IS the (now full-text) title above
    Deprecation: ["what"],         // what IS the (now full-text) title above
    Incident: ["what_broke"],      // what_broke IS the (now full-text) title above
    Convention: ["rule"],          // rule IS the (now full-text) title above
    CodeFile: ["path"],            // path IS the label
    Engineer: ["name"],            // name IS the label
    ChatSession: [],
    UserInstruction: ["content"],
    Correction: ["user_said"],
    ForgetEvent: ["reason"],       // reason IS the (now full-text) title above
  };
  return new Set(map[nodeType] || []);
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
    "removed_node_ids",  // raw UUID list — removed_types/removed_count already summarize this
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
  const overrides: Record<string, string> = {
    "author_handle": "Author",
    "made_by_handle": "Made by",
    "made_on": "When",
    "github_handle": "GitHub",
    "reviewer_handles": "Reviewers",
    "files_touched": "Files",
    "files_changed": "Files",
    "files_involved": "Files",
    "modules_owned": "Modules",
    "deprecated_on": "When",
    "replaced_with": "Replaced with",
    "what_broke": "Issue",
    "root_cause": "Root cause",
    "established_on": "Since",
    "given_at": "When",
    "started_at": "Started",
    "session_id": "Session",
    "project_context": "Project",
    "ai_suggested": "AI suggested",
    "user_said": "User said",
    "forgotten_at": "When",
    "removed_types": "Removed",
    "removed_count": "Count",
  };
  if (overrides[key]) return overrides[key];
  return key.replace(/_/g, " ").replace(/^(.)/, (m) => m.toUpperCase());
}

// Fields that should render as markdown
const MARKDOWN_FIELDS = new Set([
  "description",   // PR body
  "message",       // commit message
  "content",       // Decision, UserInstruction
  "what_broke",    // Incident
  "root_cause",    // Incident
  "why",           // Deprecation
]);

// Matches ISO 8601 datetimes like 2026-07-04T08:04:12.784020+00:00 — every
// timestamp field in this schema (made_on, date, deprecated_on, established_on,
// given_at, started_at, timestamp, last_modified) comes through in this shape,
// so detecting the format covers all of them without a per-field list to maintain.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFieldValue(val: unknown, key?: string): ReactNode {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (Array.isArray(val)) return val.length === 0 ? "—" : val.map((v) => String(v)).join(", ");
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  const str = String(val);

  if (ISO_DATE_RE.test(str)) return formatTimestamp(str);

  // Truncate SHAs to first 10 chars (dev convention: short SHAs are usable identifiers)
  if (key === "sha" && str.length > 10) {
    return <span className="font-mono">{str.slice(0, 10)}</span>;
  }

  // Truncate very long values with an ellipsis
  const truncated = str.length > 500 ? str.slice(0, 500) + "…" : str;

  if (key && MARKDOWN_FIELDS.has(key)) {
    return (
      <div className="markdown-compact">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{truncated}</ReactMarkdown>
      </div>
    );
  }

  return <InlineCode text={truncated} />;
}

// Renders backtick-delimited spans (`parse()`) as code chips without pulling in
// the full markdown pipeline — react-markdown wraps everything in <p> tags and
// fights the title's own font styling, which is overkill for what's usually a
// single short phrase with an identifier or regex fragment in it.
function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code
            key={i}
            className="rounded px-1.5 py-0.5 font-mono text-[0.85em] break-all"
            style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--text-primary)" }}
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
