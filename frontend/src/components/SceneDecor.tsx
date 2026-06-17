import { useEffect, useState } from "react";

/* Non-interactive engineered overlay: ruler, timecodes, registration marks and
   rotated version strings — the margin furniture of the ZX03 layouts. */
export default function SceneDecor() {
  const [f, setF] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setF((x) => x + 1), 1000 / 12);
    return () => clearInterval(t);
  }, []);

  const tc = `${pad((f / (12 * 60)) % 60)}:${pad((f / 12) % 60)}:${pad(f % 12, 2)}`;

  return (
    <div className="decor">
      <div className="ruler">{Array.from({ length: 21 }, (_, i) => <i key={i} />)}</div>
      <div className="tc" style={{ top: 64 }}>TC {tc}</div>
      <div className="tc" style={{ bottom: 64, color: "var(--crimson-deep)" }}>SYNC ◇ LOCKED</div>

      <span className="coord" style={{ top: 8, left: 26 }}>x:0000 y:0000</span>
      <span className="coord" style={{ top: 8, right: 14 }}>⌖ frame · 01</span>
      <span className="coord" style={{ bottom: 8, left: 26 }}>render ◇ webgl/canvas</span>
      <span className="coord" style={{ bottom: 8, right: 14 }}>fs·{tc.slice(-2)} ▟</span>

      <div className="vstring">property of neuroforge lab</div>
      <div className="vstring left">desktop imperium · portfolio 2026</div>
    </div>
  );
}

function pad(n: number, len = 2) {
  return String(Math.floor(n)).padStart(len, "0");
}
