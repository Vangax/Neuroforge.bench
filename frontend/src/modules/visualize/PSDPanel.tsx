import { useEffect, useRef } from "react";
import type { PSDData } from "../../api/client";

// warm inferno-tinted band bands
const BAND_COLOR: Record<string, string> = {
  delta: "rgba(106,23,84,0.16)", theta: "rgba(150,36,75,0.15)",
  alpha: "rgba(243,144,16,0.13)", beta: "rgba(225,96,28,0.13)",
  gamma: "rgba(255,212,122,0.11)",
};

export default function PSDPanel({ data, bands, highlight }: {
  data: PSDData; bands: Record<string, [number, number]>; highlight: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth, cssH = 248;
      canvas.width = cssW * dpr; canvas.height = cssH * dpr;
      canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const ml = 42, mr = 10, mt = 10, mb = 22;
      const pw = cssW - ml - mr, ph = cssH - mt - mb;
      const f = data.freqs;
      const fmin = f[0], fmax = f[f.length - 1];

      let dmin = Infinity, dmax = -Infinity;
      for (const row of data.psd_db) for (const v of row) {
        if (v < dmin) dmin = v; if (v > dmax) dmax = v;
      }
      const pad = (dmax - dmin) * 0.05;
      dmin -= pad; dmax += pad;

      const X = (hz: number) => ml + ((hz - fmin) / (fmax - fmin)) * pw;
      const Y = (db: number) => mt + (1 - (db - dmin) / (dmax - dmin)) * ph;

      // band shading
      for (const [name, [lo, hi]] of Object.entries(bands)) {
        ctx.fillStyle = BAND_COLOR[name] ?? "rgba(255,255,255,0.04)";
        ctx.fillRect(X(Math.max(lo, fmin)), mt, X(Math.min(hi, fmax)) - X(Math.max(lo, fmin)), ph);
        if (name === highlight) {
          ctx.strokeStyle = "rgba(255,47,94,0.65)";
          ctx.lineWidth = 1;
          ctx.strokeRect(X(Math.max(lo, fmin)), mt, X(Math.min(hi, fmax)) - X(Math.max(lo, fmin)), ph);
          ctx.fillStyle = "rgba(255,111,147,0.95)";
          ctx.font = "9px 'Share Tech Mono', monospace";
          ctx.fillText(name.toUpperCase(), X(Math.max(lo, fmin)) + 3, mt + 11);
        }
      }

      // grid + axes
      ctx.strokeStyle = "rgba(255,47,94,0.07)";
      ctx.fillStyle = "rgba(184,150,118,0.8)";
      ctx.font = "9px 'Share Tech Mono', monospace";
      ctx.lineWidth = 1;
      for (const hz of [0, 10, 20, 30, 40]) {
        if (hz < fmin || hz > fmax) continue;
        ctx.beginPath(); ctx.moveTo(X(hz), mt); ctx.lineTo(X(hz), mt + ph); ctx.stroke();
        ctx.fillText(hz + "", X(hz) - 5, cssH - 8);
      }
      for (let k = 0; k <= 4; k++) {
        const db = dmin + (k / 4) * (dmax - dmin);
        const y = Y(db);
        ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + pw, y); ctx.stroke();
        ctx.fillText(db.toFixed(0), 4, y + 3);
      }

      // per-channel faint crimson
      ctx.strokeStyle = "rgba(255,47,94,0.13)";
      ctx.lineWidth = 0.6;
      for (const row of data.psd_db) {
        ctx.beginPath();
        for (let i = 0; i < f.length; i++) {
          const px = X(f[i]), py = Y(row[i]);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // mean gold
      const mean = f.map((_, i) => data.psd_db.reduce((s, r) => s + r[i], 0) / data.psd_db.length);
      ctx.strokeStyle = "rgba(255,200,90,0.96)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < f.length; i++) {
        const px = X(f[i]), py = Y(mean[i]);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = "rgba(184,150,118,0.7)";
      ctx.fillText("Hz", ml + pw - 12, cssH - 8);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, bands, highlight]);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <canvas ref={canRef} style={{ display: "block" }} />
    </div>
  );
}
