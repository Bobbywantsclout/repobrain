"use client";

import { useEffect, useState } from "react";

export default function OnboardingHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div
      className="fixed top-16 right-6 z-10 pointer-events-none"
      style={{
        opacity: visible ? 0.7 : 0,
        transition: "opacity 500ms ease-out",
      }}
    >
      <div
        className="text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        Hover to explore · Click to inspect · <kbd style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "4px",
          padding: "1px 6px",
          fontSize: "10px",
        }}>/</kbd> to search
      </div>
    </div>
  );
}
