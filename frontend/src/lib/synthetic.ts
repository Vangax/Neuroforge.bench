/* Client-side fallback used when the backend is unreachable. Produces the same
 * shapes the API returns; values are approximate (real numbers come from MNE). */
import type {
  DatasetMeta, TreeData, WindowData, PSDData, BandPowerData, TopomapData,
  ChannelsData,
} from "../api/client";

export interface ChanPos { name: string; x: number; y: number; lobe: number }

// 32-ch 10-20 layout, nose up (+y front, +x right). `lobe` = posterior weight.
export const CH32: ChanPos[] = [
  { name: "Fp1", x: -0.31, y: 0.95, lobe: 0.1 }, { name: "Fp2", x: 0.31, y: 0.95, lobe: 0.1 },
  { name: "AF3", x: -0.35, y: 0.74, lobe: 0.12 }, { name: "AF4", x: 0.35, y: 0.74, lobe: 0.12 },
  { name: "F7", x: -0.81, y: 0.59, lobe: 0.15 }, { name: "F3", x: -0.42, y: 0.61, lobe: 0.18 },
  { name: "Fz", x: 0, y: 0.63, lobe: 0.2 }, { name: "F4", x: 0.42, y: 0.61, lobe: 0.18 },
  { name: "F8", x: 0.81, y: 0.59, lobe: 0.15 },
  { name: "FC5", x: -0.66, y: 0.3, lobe: 0.25 }, { name: "FC1", x: -0.22, y: 0.32, lobe: 0.3 },
  { name: "FC2", x: 0.22, y: 0.32, lobe: 0.3 }, { name: "FC6", x: 0.66, y: 0.3, lobe: 0.25 },
  { name: "T7", x: -1.0, y: 0, lobe: 0.4 }, { name: "C3", x: -0.5, y: 0, lobe: 0.45 },
  { name: "Cz", x: 0, y: 0, lobe: 0.5 }, { name: "C4", x: 0.5, y: 0, lobe: 0.45 },
  { name: "T8", x: 1.0, y: 0, lobe: 0.4 },
  { name: "CP5", x: -0.66, y: -0.3, lobe: 0.6 }, { name: "CP1", x: -0.22, y: -0.32, lobe: 0.7 },
  { name: "CP2", x: 0.22, y: -0.32, lobe: 0.7 }, { name: "CP6", x: 0.66, y: -0.3, lobe: 0.6 },
  { name: "P7", x: -0.81, y: -0.59, lobe: 0.8 }, { name: "P3", x: -0.42, y: -0.61, lobe: 0.85 },
  { name: "Pz", x: 0, y: -0.63, lobe: 0.9 }, { name: "P4", x: 0.42, y: -0.61, lobe: 0.85 },
  { name: "P8", x: 0.81, y: -0.59, lobe: 0.8 },
  { name: "PO3", x: -0.35, y: -0.74, lobe: 0.95 }, { name: "POz", x: 0, y: -0.78, lobe: 1.0 },
  { name: "PO4", x: 0.35, y: -0.74, lobe: 0.95 },
  { name: "O1", x: -0.31, y: -0.95, lobe: 1.0 }, { name: "O2", x: 0.31, y: -0.95, lobe: 1.0 },
];

const NAMES = CH32.map((c) => c.name);
const SF = 256;
const DUR = 60;

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_DATASETS: { id: string; subject: string; session: string; task: string; seed: number }[] = [
  { id: "demo-s01-rest", subject: "01", session: "01", task: "rest", seed: 11 },
  { id: "demo-s01-odd", subject: "01", session: "02", task: "oddball", seed: 12 },
  { id: "demo-s02-rest", subject: "02", session: "01", task: "rest", seed: 21 },
];

function meta(d: (typeof DEMO_DATASETS)[number]): DatasetMeta {
  const label = `sub-${d.subject}_ses-${d.session}_task-${d.task}`;
  return {
    id: d.id, label,
    entities: { subject: d.subject, session: d.session, task: d.task, run: null, datatype: "eeg" },
    source_format: "synthetic (offline)", source_path: null,
    sfreq: SF, n_channels: NAMES.length, n_times: SF * DUR, duration: DUR,
    highpass: 0, lowpass: SF / 2,
    channel_type_counts: { eeg: NAMES.length }, n_events: 48, extra: { paradigm: d.task },
    provenance: [{ op: "load", params: { format: "synthetic (offline)" }, timestamp: 0, software: "client" }],
  };
}

export const fallback = {
  listDatasets: (): DatasetMeta[] => DEMO_DATASETS.map(meta),

  tree: (): TreeData => {
    const tree: TreeData["tree"] = {};
    for (const d of DEMO_DATASETS) {
      const sk = `sub-${d.subject}`;
      tree[sk] ??= { subject: d.subject, sessions: {} };
      const ssk = `ses-${d.session}`;
      tree[sk].sessions[ssk] ??= { session: d.session, datasets: [] };
      tree[sk].sessions[ssk].datasets.push({
        id: d.id, label: `sub-${d.subject}_ses-${d.session}_task-${d.task}`,
        task: d.task, run: null, n_channels: NAMES.length, duration: DUR,
        sfreq: SF, source_format: "synthetic",
      });
    }
    return { tree };
  },

  channels: (): ChannelsData => ({
    channels: CH32.map((c) => ({
      name: c.name, type: "EEG", units: "µV", x: c.x, y: c.y, has_position: true,
    })),
    positions: CH32.map((c) => ({ name: c.name, x: c.x, y: c.y })),
  }),

  window: (id: string, start: number, duration: number, maxPts: number): WindowData => {
    const seed = DEMO_DATASETS.find((d) => d.id === id)?.seed ?? 7;
    const rnd = mulberry(seed + Math.floor(start * 10));
    const n = Math.floor(duration * SF);
    const step = Math.max(1, Math.ceil(n / maxPts));
    const times: number[] = [];
    const data: number[][] = CH32.map(() => []);
    let phase = CH32.map(() => rnd() * 6.28);
    const env = (t: number) => 0.7 + 0.5 * Math.sin(2 * Math.PI * 0.05 * (t + start));
    for (let i = 0; i < n; i += step) {
      const t = start + i / SF;
      times.push(t);
      for (let c = 0; c < CH32.length; c++) {
        const a = CH32[c].lobe * 14 * env(t) * Math.sin(2 * Math.PI * 10 * t + phase[c]);
        const beta = 3 * Math.sin(2 * Math.PI * 20 * t + c);
        const pink = (rnd() - 0.5) * 16;
        let blink = 0;
        if (CH32[c].y > 0.7 && (i % SF) < 20) blink = 70 * Math.exp(-(((i % SF) - 8) ** 2) / 20);
        data[c].push(a + beta + pink + blink);
      }
    }
    return {
      start, duration, sfreq: SF, decimation: step, times,
      ch_names: NAMES, data, units: "µV",
    };
  },

  psd: (id: string): PSDData => {
    const freqs: number[] = [];
    for (let f = 0.5; f <= 45; f += 0.5) freqs.push(f);
    const seed = DEMO_DATASETS.find((d) => d.id === id)?.seed ?? 7;
    const rnd = mulberry(seed);
    const psd_db = CH32.map((c) =>
      freqs.map((f) => {
        const oneOverF = 20 - 12 * Math.log10(f + 1);
        const alpha = 18 * c.lobe * Math.exp(-((f - 10) ** 2) / 6);
        const beta = 4 * Math.exp(-((f - 20) ** 2) / 40);
        return oneOverF + alpha + beta + (rnd() - 0.5) * 2 - 110;
      })
    );
    return { freqs, psd_db, ch_names: NAMES, method: "welch", units: "dB" };
  },

  bandpower: (id: string, relative: boolean): BandPowerData => {
    const seed = DEMO_DATASETS.find((d) => d.id === id)?.seed ?? 7;
    const rnd = mulberry(seed + 99);
    const defs: Record<string, [number, number]> = {
      delta: [0.5, 4], theta: [4, 8], alpha: [8, 13], beta: [13, 30], gamma: [30, 45],
    };
    const bands: Record<string, number[]> = {};
    for (const k of Object.keys(defs)) {
      bands[k] = CH32.map((c) => {
        let v = 0.4 + rnd() * 0.3;
        if (k === "alpha") v = 0.3 + c.lobe * 1.4;
        if (k === "delta") v = 0.8 + (1 - c.y) * 0.3;
        if (k === "beta") v = 0.3 + (1 - c.lobe) * 0.4;
        return relative ? v / 4 : v * 1e-11;
      });
    }
    return { bands, ch_names: NAMES, relative, band_defs: defs };
  },

  topomap: (id: string, fmin: number, fmax: number, res: number): TopomapData => {
    const bp = fallback.bandpower(id, false);
    // pick the band overlapping [fmin,fmax] most, else alpha
    const key =
      Object.entries(bp.band_defs).sort(
        (a, b) =>
          overlap(b[1], [fmin, fmax]) - overlap(a[1], [fmin, fmax])
      )[0]?.[0] ?? "alpha";
    const vals = bp.bands[key].map((v) => 10 * Math.log10(v + 1e-13));
    const positions = CH32.map((c, i) => ({ name: c.name, x: c.x, y: c.y, value: vals[i] }));
    const grid: (number | null)[][] = [];
    const lin = (k: number) => -1.3 + (2.6 * k) / (res - 1);
    let vmin = Infinity, vmax = -Infinity;
    for (let r = 0; r < res; r++) {
      const row: (number | null)[] = [];
      for (let cc = 0; cc < res; cc++) {
        const gx = lin(cc), gy = lin(r);
        if (Math.hypot(gx, gy) > 1.15) { row.push(null); continue; }
        let num = 0, den = 0;
        for (const p of positions) {
          const d2 = (gx - p.x) ** 2 + (gy - p.y) ** 2 + 1e-6;
          const w = 1 / (d2 * d2);
          num += w * p.value; den += w;
        }
        const v = num / den;
        vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
        row.push(v);
      }
      grid.push(row);
    }
    return {
      grid, resolution: res, extent: [-1.3, 1.3, -1.3, 1.3],
      vmin, vmax, band: [fmin, fmax], positions,
    };
  },
};

function overlap(a: number[], b: number[]) {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}
