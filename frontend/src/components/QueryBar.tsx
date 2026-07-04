"use client";

import { useEffect, useState, useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function QueryBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus with `/` keyboard shortcut, clear with Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape must work even while the query input itself has focus — that's
      // the most common moment a user wants to bail out of a query — so it's
      // checked before the "ignore form elements" guard below, not after it.
      if (e.key === "Escape") {
        onChange("");
        inputRef.current?.blur();
        return;
      }
      // Ignore `/` if user is typing in some other form element
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onChange]);

  // No longer self-positioned — this now renders inline as part of TopBar's single
  // header row (see page.tsx/TopBar.tsx), which guarantees it can never overlap the
  // canvas below: it occupies real document-flow space in the fixed header instead
  // of floating over the graph at a guessed viewport-relative offset. Compact,
  // fixed width so it reads as one control among several in the row, not a
  // dominant search-engine-style bar.
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border shrink-0"
      style={{
        background: "rgba(15, 22, 36, 0.85)",
        borderColor: "var(--panel-border)",
        width: "260px",
      }}
    >
      <span
        className="text-xs"
        style={{ color: "var(--text-secondary)" }}
        aria-hidden="true"
      >
        ⌕
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter nodes..."
        className="flex-1 min-w-0 bg-transparent outline-none text-sm"
        style={{ color: "var(--text-primary)" }}
        aria-label="Query the graph"
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity shrink-0"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Clear query"
        >
          clear
        </button>
      ) : (
        <kbd
          className="text-[10px] shrink-0"
          style={{
            color: "var(--text-secondary)",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            padding: "1px 5px",
          }}
          aria-hidden="true"
        >
          /
        </kbd>
      )}
    </div>
  );
}
