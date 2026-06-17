import { useEffect, useRef } from "react";
import { inferno } from "../lib/format";

/* Reusable matrix heatmap (connectivity, similarity, confusion, correlation). */
export default function Heatmap({
  matrix, rowLabels, colLabels, min, max, height = 240, cellText = false,
  color = inferno,
}: {
  matrix: number[][]; rowLabels?: string[]; colLabels?: string[];
  min?: number; max?: number; height?: number; cellText?: boolean;
  color?: (t: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current;
    if (!wrap || !canvas || !matrix.length) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth, H = height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = "8px 'Share Tech Mono', monospace";

      const gl = rowLabels ? 50 : 6;
      const gb = colLabels ? 26 : 6;
      const rows = matrix.length, cols = matrix[0].length;
      const cw = (W - gl - 6) / cols, ch = (H - gb - 6) / rows;
      let lo = min ?? Infinity, hi = max ?? -Infinity;
      if (min == null || max == null)
        for (const r of matrix) for (const v of r) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const norm = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = matrix[r][c];
          ctx.fillStyle = color(norm(v));
          ctx.fillRect(gl + c * cw, 6 + r * ch, Math.ceil(cw), Math.ceil(ch));
          if (cellText) {
            ctx.fillStyle = norm(v) > 0.5 ? "#1a0e10" : "#f6e8df";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.font = "11px 'Share Tech Mono', monospace";
            ctx.fillText(String(v), gl + c * cw + cw / 2, 6 + r * ch + ch / 2);
            ctx.font = "8px 'Share Tech Mono', monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
          }
        }
      }
      ctx.fillStyle = "rgba(200,170,130,0.85)";
      if (rowLabels) rowLabels.forEach((l, r) => ctx.fillText(l.slice(0, 8), 4, 6 + r * ch + ch / 2 + 3));
      if (colLabels) colLabels.forEach((l, c) => {
        ctx.save(); ctx.translate(gl + c * cw + cw / 2, H - gb + 10); ctx.rotate(-Math.PI / 4);
        ctx.fillText(l.slice(0, 8), -8, 0); ctx.restore();
      });
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(wrap);
    return () => ro.disconnect();
  }, [matrix, rowLabels, colLabels, min, max, height, cellText, color]);

  return <div ref={wrapRef} style={{ width: "100%" }}><canvas ref={canRef} style={{ display: "block" }} /></div>;
}
