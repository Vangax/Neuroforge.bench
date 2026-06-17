import { useEffect, useRef } from "react";
import type { BandPowerData } from "../../api/client";
import { inferno } from "../../lib/format";

/** bands × channels heatmap (per-band normalized). */
export default function BandPower({ data, highlight }: { data: BandPowerData; highlight: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const bands = Object.keys(data.bands);
      const chs = data.ch_names;
      const cssW = wrap.clientWidth;
      const gutterL = 54, gutterB = 22, top = 4;
      const rowH = 22;
      const cssH = bands.length * rowH + gutterB + top;

      canvas.width = cssW * dpr; canvas.height = cssH * dpr;
      canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.font = "9px 'Share Tech Mono', monospace";

      const plotW = cssW - gutterL - 8;
      const cw = plotW / chs.length;

      bands.forEach((b, r) => {
        const vals = data.bands[b];
        let lo = Infinity, hi = -Infinity;
        for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
        const y = top + r * rowH;
        // cells
        vals.forEach((v, c) => {
          const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
          ctx.fillStyle = inferno(t);
          ctx.fillRect(gutterL + c * cw, y + 1, Math.ceil(cw), rowH - 2);
        });
        // band label
        ctx.fillStyle = b === highlight ? "rgba(255,111,147,1)" : "rgba(200,170,130,0.9)";
        ctx.fillText(b.toUpperCase(), 6, y + rowH / 2 + 3);
        // highlight row outline
        if (b === highlight) {
          ctx.strokeStyle = "rgba(255,47,94,0.85)";
          ctx.lineWidth = 1.2;
          ctx.strokeRect(gutterL, y + 1, plotW, rowH - 2);
        }
      });

      // channel ticks every 2
      ctx.fillStyle = "rgba(184,150,118,0.8)";
      chs.forEach((name, c) => {
        if (c % 2 !== 0) return;
        ctx.save();
        ctx.translate(gutterL + c * cw + cw / 2, top + bands.length * rowH + 8);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(name, -10, 0);
        ctx.restore();
      });
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, highlight]);

  return (
    <div ref={wrapRef} style={{ width: "100%", padding: 6 }}>
      <canvas ref={canRef} style={{ display: "block" }} />
    </div>
  );
}
