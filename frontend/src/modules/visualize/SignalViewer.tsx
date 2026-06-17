import { useEffect, useRef } from "react";
import type { WindowData } from "../../api/client";

/** Stacked multichannel time-series, phosphor-on-black. Canvas for 32ch×N smoothly. */
export default function SignalViewer({ data, gain }: { data: WindowData; gain: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth;
      const nCh = data.ch_names.length;
      const lane = 12;
      const axisH = 24;
      const cssH = nCh * lane + axisH + 6;

      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const gutter = 48;
      const right = 10;
      const plotW = cssW - gutter - right;
      const n = data.times.length;
      const x = (i: number) => gutter + (i / Math.max(1, n - 1)) * plotW;
      const pxPerUv = (lane * 0.46) / gain;

      // vertical time grid
      ctx.strokeStyle = "rgba(255,47,94,0.07)";
      ctx.lineWidth = 1;
      const ticks = 10;
      ctx.font = "9px 'Share Tech Mono', monospace";
      for (let k = 0; k <= ticks; k++) {
        const px = gutter + (k / ticks) * plotW;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, nCh * lane); ctx.stroke();
        const t = data.start + (k / ticks) * data.duration;
        ctx.fillStyle = "rgba(184,150,118,0.75)";
        ctx.fillText(t.toFixed(1) + "s", px - 8, nCh * lane + 14);
      }

      // lanes
      for (let c = 0; c < nCh; c++) {
        const base = c * lane + lane / 2;
        // baseline
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath(); ctx.moveTo(gutter, base); ctx.lineTo(gutter + plotW, base); ctx.stroke();
        // label
        ctx.fillStyle = "rgba(184,150,118,0.85)";
        ctx.fillText(data.ch_names[c], 6, base + 3);

        // trace
        const row = data.data[c];
        ctx.strokeStyle = c % 6 === 0 ? "rgba(255,47,94,0.9)" : "rgba(255,178,46,0.82)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          let y = base - row[i] * pxPerUv;
          const half = lane * 0.5;
          if (y < base - half) y = base - half;
          if (y > base + half) y = base + half;
          if (i === 0) ctx.moveTo(x(i), y); else ctx.lineTo(x(i), y);
        }
        ctx.stroke();
      }

      // gutter separator + playhead
      ctx.strokeStyle = "rgba(255,47,94,0.32)";
      ctx.beginPath(); ctx.moveTo(gutter, 0); ctx.lineTo(gutter, nCh * lane); ctx.stroke();
      ctx.strokeStyle = "rgba(255,178,46,0.55)";
      ctx.beginPath(); ctx.moveTo(gutter + plotW, 0); ctx.lineTo(gutter + plotW, nCh * lane); ctx.stroke();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, gain]);

  return (
    <div ref={wrapRef} style={{ width: "100%", overflow: "hidden" }}>
      <canvas ref={canRef} style={{ display: "block" }} />
    </div>
  );
}
