"use client";

import { useEffect, useState } from "react";
import { ingestRepo, IngestResponse } from "@/lib/api";
import { HEADER_HEIGHT } from "@/lib/design";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function IngestPanel({ isOpen, onClose, onComplete }: Props) {
  const [repo, setRepo] = useState("");
  const [branches, setBranches] = useState("");
  const [commits, setCommits] = useState("20");
  const [prs, setPrs] = useState("10");
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setRepo("");
      setBranches("");
      setCommits("20");
      setPrs("10");
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  const handleIngest = async () => {
    if (!repo.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const branchList = branches
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      const res = await ingestRepo(
        repo.trim(),
        branchList.length ? branchList : null,
        Number(commits) || 20,
        Number(prs) || 10
      );
      setResult(res);
      onComplete();
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
        width: "480px",
        background: "rgba(15, 22, 36, 0.95)",
        backdropFilter: "blur(16px)",
        border: "1px solid var(--panel-border)",
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
      }}
      role="dialog"
      aria-label="Ingest a repository"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: "hsl(142, 71%, 50%)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Ingest repository
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

      {/* Repo input */}
      <div className="mb-3">
        <label
          className="block text-xs uppercase tracking-wider mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          GitHub repo
        </label>
        <input
          autoFocus
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="e.g. https://github.com/vercel/ms or owner/repo"
          className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm"
          style={{
            color: "var(--text-primary)",
            borderColor: "var(--panel-border)",
          }}
        />
      </div>

      {/* Branches input */}
      <div className="mb-3">
        <label
          className="block text-xs uppercase tracking-wider mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Branches (optional, comma-separated)
        </label>
        <input
          value={branches}
          onChange={(e) => setBranches(e.target.value)}
          placeholder="e.g. main,paul/use-vitest"
          className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm"
          style={{
            color: "var(--text-primary)",
            borderColor: "var(--panel-border)",
          }}
        />
      </div>

      {/* Commit/PR limits */}
      <div className="mb-4 flex gap-3">
        <div className="flex-1">
          <label
            className="block text-xs uppercase tracking-wider mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Max commits
          </label>
          <input
            value={commits}
            onChange={(e) => setCommits(e.target.value)}
            className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm"
            style={{ color: "var(--text-primary)", borderColor: "var(--panel-border)" }}
          />
        </div>
        <div className="flex-1">
          <label
            className="block text-xs uppercase tracking-wider mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Max PRs
          </label>
          <input
            value={prs}
            onChange={(e) => setPrs(e.target.value)}
            className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm"
            style={{ color: "var(--text-primary)", borderColor: "var(--panel-border)" }}
          />
        </div>
      </div>

      {loading && (
        <div className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          Ingesting... this can take several minutes per branch — Gemini extracts
          decisions/deprecations/incidents/conventions from every commit and PR one at a time.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 text-xs" style={{ color: "hsl(0, 84%, 65%)" }}>
          {error}
        </div>
      )}

      {/* Result summary */}
      {result && (
        <div className="mb-4 text-xs space-y-1" style={{ color: "var(--text-primary)" }}>
          <div style={{ color: "hsl(142, 71%, 60%)", fontWeight: 500 }}>Ingestion complete.</div>
          <div>Commits ingested: {result.commits}</div>
          <div>Pull requests ingested: {result.prs}</div>
          <div>Files indexed: {result.files}</div>
          <div>Decisions extracted: {result.decisions}</div>
          <div>Deprecations extracted: {result.deprecations}</div>
          <div>Incidents extracted: {result.incidents}</div>
          <div>Conventions extracted: {result.conventions}</div>
          <div style={{ color: "var(--text-secondary)" }}>
            Total DataPoints pushed: {result.total_datapoints}
          </div>
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
          onClick={handleIngest}
          disabled={!repo.trim() || loading}
          className="px-4 py-2 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            color: "white",
            background: "hsl(142, 71%, 35%)",
          }}
        >
          {loading ? "Ingesting..." : "Ingest"}
        </button>
      </div>
    </div>
  );
}
