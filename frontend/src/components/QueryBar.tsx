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

  return (
    <div
      className="fixed top-1/2 left-1/2 z-10 pointer-events-none"
      style={{
        transform: "translate(-50%, calc(-50% - 40vh))", // just below top bar
      }}
    >
      <div
        className="pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-full border"
        style={{
          background: "rgba(15, 22, 36, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderColor: "var(--panel-border)",
          minWidth: "500px",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3)",
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
          placeholder="What are you working on?"
          className="flex-1 bg-transparent outline-none text-base"
          style={{ color: "var(--text-primary)" }}
          aria-label="Query the graph"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Clear query"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
