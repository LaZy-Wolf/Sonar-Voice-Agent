import { ImageResponse } from "next/og";

export const alt = "Sonar, a real-time voice agent with every stage of every turn measured";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#efe8d8";
const DIM = "#a6a79c";
const AMBER = "#f0a32e";
const RED = "#e8625a";

/** The card a portfolio or resume link unfurls into: the claim, and the number that misses. */
export default function Image() {
  const stages = [
    ["Hearing", 772, 350],
    ["Transcribing", 165, 150],
    ["Thinking", 312, 500],
    ["Speaking", 163, 150],
  ] as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "radial-gradient(circle at 88% 0%, #3a3222 0%, #1b1d18 55%)",
          color: INK,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: AMBER }} />
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Sonar</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
            It picks up the phone.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: DIM, maxWidth: 900, lineHeight: 1.35 }}>
            A real-time voice agent with every stage of every turn measured, including the
            ones that miss.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 40 }}>
            {stages.map(([label, ms, target]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 18, color: DIM, letterSpacing: 2, textTransform: "uppercase" }}>
                  {label}
                </div>
                <div style={{ fontSize: 34, marginTop: 6, color: ms > target ? RED : INK }}>{`${ms} ms`}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ fontSize: 18, color: DIM, letterSpacing: 2, textTransform: "uppercase" }}>
              Time to first audio
            </div>
            <div style={{ fontSize: 64, fontWeight: 700, marginTop: 4 }}>1412 ms</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
