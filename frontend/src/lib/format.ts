export const f1 = (n: number) => n.toFixed(1);
export const f2 = (n: number) => n.toFixed(2);
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function sci(n: number, digits = 2): string {
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 0.01 && a < 1e4) return n.toFixed(digits);
  return n.toExponential(digits);
}

export function nowStamp(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function ramp(stops: [number, number, number][]) {
  return (t: number): string => {
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.floor(t);
    const f = t - i;
    const a = stops[i];
    const b = stops[Math.min(i + 1, stops.length - 1)];
    const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
}

// inferno/magma — black → violet → crimson → orange → gold → pale.
// Matches the ZX03 crimson-burst + golden-coil grade; used for all heat maps.
export const inferno = ramp([
  [4, 2, 8], [26, 11, 46], [66, 14, 79], [106, 23, 84], [150, 36, 75],
  [193, 58, 52], [225, 96, 28], [243, 144, 16], [248, 195, 58], [252, 238, 152], [255, 252, 222],
]);

// kept for any neutral heat needs
export const viridis = ramp([
  [13, 8, 33], [62, 38, 130], [49, 130, 137], [54, 184, 106], [185, 222, 40], [253, 231, 37],
]);

// crimson→gold diverging ramp (electrodes / accents)
export const cg = ramp([[255, 47, 94], [255, 120, 80], [255, 178, 46], [255, 212, 122]]);
