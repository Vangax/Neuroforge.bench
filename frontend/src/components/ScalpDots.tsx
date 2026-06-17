import { useEffect, useRef } from "react";
import { inferno } from "../lib/format";

/* Lightweight scalp map: head outline + electrodes colored by value (no
   interpolation). Used for ERP difference topographies and CSP patterns. */
export default function ScalpDots({
  values, size = 180, diverging = false,
}: {
  values: { name: string; x: number; y: number; value: number }[];
  size?: number; diverging?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !values.length) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + "px"; canvas.style.height = size + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const s = size * 0.4, cx = size / 2, cy = size / 2;
    const px = (x: number) => cx + x * s, py = (y: number) => cy - y * s;
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { if (v.value < lo) lo = v.value; if (v.value > hi) hi = v.value; }
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    const norm = (v: number) => diverging ? (v / m) * 0.5 + 0.5 : (hi > lo ? (v - lo) / (hi - lo) : 0.5);

    // head
    ctx.strokeStyle = "rgba(255,178,46,0.55)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.13, cy - s * 0.97); ctx.lineTo(cx, cy - s * 1.16);
    ctx.lineTo(cx + s * 0.13, cy - s * 0.97); ctx.stroke();

    for (const v of values) {
      ctx.beginPath(); ctx.arc(px(v.x), py(v.y), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = inferno(norm(v.value)); ctx.fill();
      ctx.lineWidth = 0.5; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.stroke();
    }
  }, [values, size, diverging]);

  return <canvas ref={ref} style={{ display: "block", margin: "0 auto" }} />;
}
