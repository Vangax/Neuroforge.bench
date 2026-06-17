import { useEffect, useRef } from "react";
import type { TopomapData } from "../../api/client";
import { inferno } from "../../lib/format";

/** Interpolated band-power scalp map: heatmap + head outline + electrodes. */
export default function Topomap({ data }: { data: TopomapData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = Math.min(wrap.clientWidth, 276);
      canvas.width = size * dpr; canvas.height = size * dpr;
      canvas.style.width = size + "px"; canvas.style.height = size + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const s = size * 0.36;            // px per coord unit
      const cx = size * 0.45, cy = size * 0.5;
      const px = (x: number) => cx + x * s;
      const py = (y: number) => cy - y * s;
      const { grid, resolution: res, vmin, vmax } = data;
      const norm = (v: number) => (vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5);
      const coord = (k: number) => -1.3 + (2.6 * k) / (res - 1);

      // clip to head disk
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, s * 1.06, 0, Math.PI * 2); ctx.clip();

      const cw = (2.6 / (res - 1)) * s + 1.5;
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const v = grid[r][c];
          if (v == null) continue;
          ctx.fillStyle = inferno(norm(v));
          ctx.fillRect(px(coord(c)) - cw / 2, py(coord(r)) - cw / 2, cw, cw);
        }
      }
      ctx.restore();

      // head outline + nose + ears
      ctx.strokeStyle = "rgba(255,178,46,0.6)";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.14, cy - s * 0.97);
      ctx.lineTo(cx, cy - s * 1.18);
      ctx.lineTo(cx + s * 0.14, cy - s * 0.97);
      ctx.stroke();
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + sgn * s, cy, s * 0.12, -Math.PI / 2, Math.PI / 2, sgn < 0);
        ctx.stroke();
      }

      // electrodes
      for (const p of data.positions) {
        const X = px(p.x), Y = py(p.y);
        ctx.beginPath(); ctx.arc(X, Y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = inferno(norm(p.value));
        ctx.fill();
        ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke();
      }

      // colorbar
      const bx = size - 14, bw = 8, bt = size * 0.18, bh = size * 0.64;
      for (let i = 0; i < bh; i++) {
        ctx.fillStyle = inferno(1 - i / bh);
        ctx.fillRect(bx, bt + i, bw, 1);
      }
      ctx.strokeStyle = "rgba(184,150,118,0.5)"; ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, bt, bw, bh);
      ctx.fillStyle = "rgba(200,170,130,0.9)";
      ctx.font = "8px 'Share Tech Mono', monospace";
      ctx.fillText(vmax.toFixed(0), bx - 2, bt - 4);
      ctx.fillText(vmin.toFixed(0), bx - 2, bt + bh + 10);
      ctx.fillText("dB", bx - 2, bt + bh / 2);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data]);

  return (
    <div ref={wrapRef} className="center" style={{ width: "100%", padding: 6 }}>
      <canvas ref={canRef} style={{ display: "block" }} />
    </div>
  );
}
