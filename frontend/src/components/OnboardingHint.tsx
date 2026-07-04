"use client";

// A permanent bottom-left hint bar, not a fading tooltip — it costs nothing to
// leave on screen and makes the app read as finished rather than mid-onboarding.
// Also doubles as narration for anyone watching over someone's shoulder (a demo
// video viewer included).
export default function OnboardingHint() {
  return (
    <div
      className="fixed bottom-6 left-6 z-10 rounded-xl border px-4 py-2.5"
      style={{
        background: "rgba(15, 22, 36, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "var(--panel-border)",
      }}
    >
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Hover: highlight neighbors · Click: details ·{" "}
        <kbd
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: "4px",
            padding: "1px 6px",
            fontSize: "10px",
          }}
        >
          /
        </kbd>{" "}
        search
      </span>
    </div>
  );
}
