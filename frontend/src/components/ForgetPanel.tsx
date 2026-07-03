"use client";

import { useEffect, useState } from "react";
import { previewForget, executeForget, ForgetPreviewResponse } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (removedNodeIds: string[]) => void;
}

export default function ForgetPanel({ isOpen, onClose, onComplete }: Props) {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ForgetPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced preview when query changes
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await previewForget(query);
        setPreview(result);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setReason("");
      setPreview(null);
      setConfirming(false);
      setError(null);
    }
  }, [isOpen]);

  const handleConfirmForget = async () => {
    if (!query.trim() || !reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await executeForget(query, reason);
      onComplete(result.removed_node_ids);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-16 left-1/2 z-20 flex flex-col"
      style={{
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
      aria-label="Forget memories"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: "hsl(0, 84%, 60%)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Forget memories
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
          What to forget
        </label>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Redis, old payment API, departing engineer..."
          className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm"
          style={{
            color: "var(--text-primary)",
            borderColor: "var(--panel-border)",
          }}
        />
      </div>

      {/* Preview count */}
      {preview && (
        <div className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          {preview.count === 0 && "No matching memories found."}
          {preview.count > 0 && (
            <>
              <span style={{ color: "hsl(0, 84%, 65%)", fontWeight: 500 }}>
                {preview.count} {preview.count === 1 ? "memory" : "memories"}
              </span>{" "}
              will be forgotten.
            </>
          )}
        </div>
      )}
      {loading && <div className="mb-3 text-xs opacity-60">Searching...</div>}

      {/* Reason input */}
      <div className="mb-4">
        <label
          className="block text-xs uppercase tracking-wider mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Reason (for the record)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Redis was removed six months ago, LRU is now standard"
          rows={2}
          className="w-full bg-transparent border rounded px-3 py-2 outline-none text-sm resize-none"
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
          Cancel
        </button>
        <button
          onClick={handleConfirmForget}
          disabled={!query.trim() || !reason.trim() || !preview || preview.count === 0 || loading}
          className="px-4 py-2 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            color: "white",
            background: "hsl(0, 84%, 40%)",
          }}
        >
          {loading ? "Forgetting..." : "Forget"}
        </button>
      </div>
    </div>
  );
}
