import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

/* Generative hero: a chromatic shard-burst over black — crimson→gold rays,
   glass shards, hot core and a vanishing-point floor. Echoes the ZX03 /
   "emotional abstracts" explosion blended with the golden-coil warmth. */

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x9e3779b9) | 0;
    let t = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

const PAL: [number, number, number][] = [
  [255, 47, 94], [255, 61, 154], [255, 110, 70], [255, 178, 46], [255, 240, 226],
];
function pcol(t: number, a: number) {
  t = Math.max(0, Math.min(0.999, t)) * (PAL.length - 1);
  const i = Math.floor(t), f = t - i;
  const x = PAL[i], y = PAL[i + 1] ?? x;
  return `rgba(${Math.round(x[0] + (y[0] - x[0]) * f)},${Math.round(x[1] + (y[1] - x[1]) * f)},${Math.round(x[2] + (y[2] - x[2]) * f)},${a})`;
}

interface Ray { ang: number; len: number; w: number; t: number; ph: number; sp: number }
interface Shard { ang: number; r0: number; r1: number; spread: number; t: number; a: number }

export default function HeroBurst({
  animate = true, floor = true, seed = 7, style, className,
}: { animate?: boolean; floor?: boolean; seed?: number; style?: CSSProperties; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    const r = rng(seed);

    const rays: Ray[] = Array.from({ length: 150 }, () => ({
      ang: r() * Math.PI * 2,
      len: 0.25 + r() * 0.95,
      w: 0.4 + r() * 2.4,
      t: r(),
      ph: r() * Math.PI * 2,
      sp: 0.4 + r() * 1.6,
    }));
    const shards: Shard[] = Array.from({ length: 26 }, () => ({
      ang: r() * Math.PI * 2,
      r0: 0.04 + r() * 0.1,
      r1: 0.3 + r() * 0.8,
      spread: 0.02 + r() * 0.07,
      t: r(),
      a: 0.05 + r() * 0.14,
    }));

    let W = 0, H = 0, cx = 0, cy = 0, R = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth; H = wrap.clientHeight || 1;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W * 0.4; cy = H * 0.46; R = Math.hypot(W, H) * 0.62;
    };
    resize();

    let raf = 0; const t0 = performance.now();
    const frame = () => {
      const time = animate ? (performance.now() - t0) / 1000 : 1.2;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#040206";
      ctx.fillRect(0, 0, W, H);

      // vanishing-point floor
      if (floor) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,47,94,0.12)";
        ctx.lineWidth = 1;
        const fy = H * 0.66;
        for (let i = -10; i <= 10; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 14, fy);
          ctx.lineTo(cx + i * (W * 0.16), H + 4);
          ctx.stroke();
        }
        for (let k = 1; k <= 7; k++) {
          const yy = fy + (H - fy) * (k / 7) * (k / 7);
          ctx.globalAlpha = 0.5 - k * 0.05;
          ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(time * 0.05) * 0.06);
      ctx.globalCompositeOperation = "lighter";

      // glass shards (translucent triangles)
      for (const s of shards) {
        const pump = 0.85 + 0.15 * Math.sin(time * 0.6 + s.t * 9);
        const a0 = s.ang, a1 = s.ang + s.spread;
        const x0 = Math.cos(a0) * s.r0 * R, y0 = Math.sin(a0) * s.r0 * R;
        const x1 = Math.cos(a0) * s.r1 * R * pump, y1 = Math.sin(a0) * s.r1 * R * pump;
        const x2 = Math.cos(a1) * s.r1 * R * pump, y2 = Math.sin(a1) * s.r1 * R * pump;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, pcol(s.t, s.a * 1.6));
        g.addColorStop(1, pcol(s.t * 0.5, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill();
      }

      // light rays
      for (const ray of rays) {
        const flick = 0.55 + 0.45 * Math.sin(time * ray.sp + ray.ph);
        const len = ray.len * R * (0.7 + 0.3 * flick);
        const ex = Math.cos(ray.ang) * len, ey = Math.sin(ray.ang) * len;
        const g = ctx.createLinearGradient(0, 0, ex, ey);
        g.addColorStop(0, pcol(ray.t, 0.9 * flick));
        g.addColorStop(0.5, pcol(ray.t * 0.7 + 0.15, 0.32 * flick));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = ray.w;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
      }

      // hot core
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.34);
      core.addColorStop(0, "rgba(255,244,232,0.95)");
      core.addColorStop(0.12, "rgba(255,160,150,0.7)");
      core.addColorStop(0.4, "rgba(255,61,120,0.28)");
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (animate) raf = requestAnimationFrame(frame);
    };
    frame();

    const ro = new ResizeObserver(() => { resize(); if (!animate) frame(); });
    ro.observe(wrap);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [animate, floor, seed]);

  return (
    <div ref={wrapRef} className={className} style={{ position: "absolute", inset: 0, ...style }}>
      <canvas ref={canRef} style={{ display: "block" }} />
    </div>
  );
}
