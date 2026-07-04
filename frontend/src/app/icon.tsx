import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// A tiny version of the app's own graph — three colored nodes connected by
// edges, in the same palette as the canvas — rather than the default Next.js
// logo left over from create-next-app.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(222, 47%, 9%)",
          borderRadius: 6,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <line x1="11" y1="4" x2="5" y2="17" stroke="hsl(280, 65%, 60%)" strokeWidth="1.5" />
          <line x1="11" y1="4" x2="17" y2="17" stroke="hsl(280, 65%, 60%)" strokeWidth="1.5" />
          <line x1="5" y1="17" x2="17" y2="17" stroke="hsl(280, 65%, 60%)" strokeWidth="1.5" />
          <circle cx="11" cy="4" r="3.2" fill="hsl(280, 65%, 60%)" />
          <circle cx="5" cy="17" r="3.2" fill="hsl(217, 91%, 60%)" />
          <circle cx="17" cy="17" r="3.2" fill="hsl(0, 84%, 60%)" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
