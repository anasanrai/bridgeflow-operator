import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";

const SIZE = { width: 1200, height: 630 };

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          background:
            "radial-gradient(circle at 25% 15%, rgba(0,212,170,0.18) 0, rgba(10,10,12,0) 55%), radial-gradient(circle at 85% 90%, rgba(0,212,170,0.10) 0, rgba(10,10,12,0) 60%), #0a0a0c",
          color: "#e7e9ee",
          fontFamily: "Inter, system-ui, -apple-system, Helvetica, sans-serif",
        }}
      >
        {/* top: brand chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "rgba(0,212,170,0.10)",
              border: "1px solid rgba(0,212,170,0.45)",
              boxShadow: "0 0 24px rgba(0,212,170,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="#00d4aa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12l9-9 9 9" />
              <path d="M3 18l9-9 9 9" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "#fafafa",
              }}
            >
              BridgeFlow
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#9499a6",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              Operator
            </div>
          </div>
        </div>

        {/* center: headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              color: "#fafafa",
              maxWidth: 980,
            }}
          >
            BridgeFlow Operator
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 400,
              color: "#a8acb6",
              maxWidth: 900,
              letterSpacing: "-0.005em",
              lineHeight: 1.3,
            }}
          >
            Drop a sales call. Five autonomous agents qualify, draft,
            fire, and self-review.
          </div>
        </div>

        {/* bottom: built-with chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 20px",
              borderRadius: 999,
              background: "rgba(0,212,170,0.08)",
              border: "1px solid rgba(0,212,170,0.40)",
              color: "#00d4aa",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#00d4aa",
                boxShadow: "0 0 14px rgba(0,212,170,0.7)",
              }}
            />
            Built with Claude Opus 4.7
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#6b6f7a",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              letterSpacing: "0.02em",
            }}
          >
            operator.bridgeflow.agency
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: {
        // 1 hour CDN cache — covers a demo cycle without staling forever
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}
