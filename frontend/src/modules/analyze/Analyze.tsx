import { useEffect, useRef, useState } from "react";
import { Panel, Spinner, KV } from "../../components/hud";
import Heatmap from "../../components/Heatmap";
import ScalpDots from "../../components/ScalpDots";
import { NoData } from "../preprocess/Preprocess";
import { mod, type ModuleProps, type FeaturesResult, type ConnResult } from "../../api/modules";
import { inferno } from "../../lib/format";

const BANDS = ["delta", "theta", "alpha", "beta", "gamma"];
const METHODS = [["plv", "PLV"], ["pli", "PLI"], ["wpli", "wPLI"], ["coh", "Coherence"]];

type Apr = Awaited<ReturnType<typeof mod.aperiodic>>;
type Ms = Awaited<ReturnType<typeof mod.microstates>>;
const MS_COLORS = ["#ff2f5e", "#ffb22e", "#36d6c0", "#ff3d9a", "#8af6ff", "#ffd884", "#9dff5c"];

export default function Analyze({ dataset }: ModuleProps) {
  const [feat, setFeat] = useState<FeaturesResult | null>(null);
  const [conn, setConn] = useState<ConnResult | null>(null);
  const [method, setMethod] = useState("plv");
  const [band, setBand] = useState("alpha");
  const [sort, setSort] = useState<{ col: string; dir: number }>({ col: "rms", dir: -1 });
  const [apr, setApr] = useState<Apr | null>(null);
  const [ms, setMs] = useState<Ms | null>(null);
  const id = dataset?.id;

  useEffect(() => { setFeat(null); if (id) mod.features(id).then(setFeat).catch(() => {}); }, [id]);
  useEffect(() => { setConn(null); if (id) mod.connectivity(id, method, band).then(setConn).catch(() => {}); }, [id, method, band]);
  useEffect(() => { setApr(null); if (id) mod.aperiodic(id).then(setApr).catch(() => {}); }, [id]);
  useEffect(() => { setMs(null); if (id) mod.microstates(id).then(setMs).catch(() => {}); }, [id]);

  if (!dataset) return <NoData />;

  const rows = feat ? [...feat.rows].sort((a, b) => {
    const av = a[sort.col], bv = b[sort.col];
    return (typeof av === "number" && typeof bv === "number" ? (av - bv) : String(av).localeCompare(String(bv))) * sort.dir;
  }) : [];

  return (
    <div className="col">
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", alignItems: "start" }}>
      <Panel tag="M05" title="Feature Extractor" meta={feat ? `${feat.rows.length} ch × ${feat.columns.length - 1} features` : ""} bodyClass="tight" style={{ maxHeight: 560 }}>
        {!feat ? <Spinner label="extracting features" /> : (
          <table className="nf">
            <thead><tr>{feat.columns.map((c) => (
              <th key={c} style={{ cursor: "pointer" }} onClick={() => setSort((s) => ({ col: c, dir: s.col === c ? -s.dir : -1 }))}>
                {c}{sort.col === c ? (sort.dir < 0 ? " ▾" : " ▴") : ""}
              </th>))}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{feat.columns.map((c) => (
                  <td key={c} className={c === "name" ? "crim" : ""}>{typeof r[c] === "number" ? (r[c] as number).toFixed(c === "name" ? 0 : 2) : r[c]}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="col">
        <Panel tag="CONN" title="Functional Connectivity" meta={conn ? `${conn.method.toUpperCase()} · ${conn.band}` : ""}>
          <div className="row wrap" style={{ gap: 14, marginBottom: 10 }}>
            <div className="field"><label>method</label>
              <select className="nf" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div className="field"><label>band</label>
              <select className="nf" value={band} onChange={(e) => setBand(e.target.value)}>
                {BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></div>
          </div>
          {!conn ? <Spinner label="computing connectivity" /> : (
            <div className="col" style={{ gap: 12 }}>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div className="tiny up dim" style={{ marginBottom: 4 }}>matrix</div>
                  <Heatmap matrix={conn.matrix} min={0} max={Math.max(...conn.matrix.flat())} height={190} /></div>
                <div><div className="tiny up dim" style={{ marginBottom: 4 }}>connectogram</div>
                  <Connectogram conn={conn} /></div>
              </div>
              <KV items={[
                ["graph density", conn.density.toFixed(3), true],
                ["global clustering", conn.global_clustering.toFixed(3)],
                ["edge threshold", conn.threshold.toFixed(3)],
              ]} />
            </div>
          )}
        </Panel>

        <Panel tag="1/f" title="Spectral parameterization" meta={apr ? `χ=${apr.mean.exponent.toFixed(2)}` : ""}>
          {!apr ? <Spinner label="fitting aperiodic" /> : (
            <div className="col" style={{ gap: 10 }}>
              <AperiodicPlot apr={apr} />
              <KV items={[
                ["aperiodic exponent (χ)", apr.mean.exponent.toFixed(3), true],
                ["offset", apr.mean.offset.toFixed(2)],
                ["fit R²", apr.mean.r2.toFixed(3)],
              ]} />
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="tiny up dim">oscillatory peaks:</span>
                {apr.peaks.length ? apr.peaks.map((p, i) => <span key={i} className="chip">{p.cf.toFixed(1)} Hz</span>)
                  : <span className="tiny dim">none</span>}
              </div>
            </div>
          )}
        </Panel>
      </div>
      </div>

      <Panel tag="MS" title="Microstates" meta={ms ? `${ms.n_states} states · GEV ${(ms.gev * 100).toFixed(0)}%` : ""}>
        {!ms ? <Spinner label="clustering microstates" /> : <MicrostatesView ms={ms} />}
      </Panel>
    </div>
  );
}

function MicrostatesView({ ms }: { ms: Ms }) {
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap" style={{ gap: 18, justifyContent: "space-around" }}>
        {ms.maps.map((m, k) => (
          <div key={m.label} className="col" style={{ alignItems: "center", gap: 2 }}>
            <ScalpDots values={m.positions} diverging size={120} />
            <span style={{ color: MS_COLORS[k], fontWeight: 700, letterSpacing: "0.12em" }}>{m.label}</span>
            <span className="tiny dim">{(ms.coverage[k] * 100).toFixed(0)}% · {ms.mean_duration_ms[k].toFixed(0)}ms</span>
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 240px", gap: 14, alignItems: "start" }}>
        <div>
          <div className="tiny up dim" style={{ marginBottom: 6 }}>state sequence ›</div>
          <SeqStrip seq={ms.sequence} />
          <table className="nf" style={{ marginTop: 10 }}>
            <thead><tr><th>state</th><th>coverage</th><th>duration</th><th>occur/s</th></tr></thead>
            <tbody>
              {ms.letters.map((L, k) => (
                <tr key={L}>
                  <td style={{ color: MS_COLORS[k], fontWeight: 700 }}>{L}</td>
                  <td className="gold">{(ms.coverage[k] * 100).toFixed(1)}%</td>
                  <td>{ms.mean_duration_ms[k].toFixed(0)} ms</td>
                  <td className="dim">{ms.occurrence_per_s[k].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="tiny up dim" style={{ marginBottom: 6 }}>transition probabilities</div>
          <Heatmap matrix={ms.transitions} rowLabels={ms.letters} colLabels={ms.letters}
            min={0} max={Math.max(0.01, ...ms.transitions.flat())} height={180} cellText />
        </div>
      </div>
    </div>
  );
}

function SeqStrip({ seq }: { seq: number[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current; if (!wrap || !canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = 26;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const bw = W / seq.length;
      seq.forEach((s, i) => { ctx.fillStyle = MS_COLORS[s % MS_COLORS.length]; ctx.fillRect(i * bw, 0, Math.ceil(bw), H); });
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(wrap); return () => ro.disconnect();
  }, [seq]);
  return <div ref={wrapRef} style={{ width: "100%" }}><canvas ref={canRef} style={{ display: "block" }} /></div>;
}

function AperiodicPlot({ apr }: { apr: Apr }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current; if (!wrap || !canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = 150;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const f = apr.freqs, psd = apr.mean_psd_db, ap = apr.mean_aperiodic_db;
      const all = [...psd, ...ap]; let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
      const X = (hz: number) => 30 + (hz / f[f.length - 1]) * (W - 38), Y = (d: number) => 6 + (1 - (d - lo) / (hi - lo)) * (H - 22);
      const line = (arr: number[], col: string, dash: number[]) => { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash(dash); ctx.beginPath(); f.forEach((hz, i) => { const x = X(hz), y = Y(arr[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); };
      ctx.fillStyle = "rgba(184,150,118,0.8)"; ctx.font = "8px 'Share Tech Mono', monospace";
      [0, 10, 20, 30, 40].forEach((hz) => { if (hz <= f[f.length - 1]) ctx.fillText(hz + "", X(hz) - 4, H - 4); });
      line(psd, "rgba(255,200,90,0.95)", []);
      line(ap, "rgba(255,47,94,0.9)", [4, 3]);
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(wrap); return () => ro.disconnect();
  }, [apr]);
  return <div ref={wrapRef} style={{ width: "100%" }}><canvas ref={canRef} style={{ display: "block" }} /></div>;
}

function Connectogram({ conn }: { conn: ConnResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1, S = 200;
    canvas.width = S * dpr; canvas.height = S * dpr; canvas.style.width = S + "px"; canvas.style.height = S + "px";
    const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S, S);
    const n = conn.names.length, cx = S / 2, cy = S / 2, R = S * 0.4;
    const pt = (i: number) => [cx + R * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2), cy + R * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2)];
    const vals = conn.matrix.flat(); const mx = Math.max(...vals) || 1;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const w = conn.matrix[i][j]; if (w < conn.threshold) continue;
      const [x1, y1] = pt(i), [x2, y2] = pt(j); const t = w / mx;
      ctx.strokeStyle = inferno(t).replace("rgb", "rgba").replace(")", `,${0.15 + t * 0.6})`);
      ctx.lineWidth = 0.4 + t * 1.6; ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i); const d = conn.nodes[i]?.degree ?? 0; const dmax = Math.max(...conn.nodes.map((nn) => nn.degree)) || 1;
      ctx.beginPath(); ctx.arc(x, y, 2 + 3 * (d / dmax), 0, Math.PI * 2);
      ctx.fillStyle = inferno(d / dmax); ctx.fill();
    }
  }, [conn]);
  return <canvas ref={ref} style={{ display: "block", margin: "0 auto" }} />;
}
