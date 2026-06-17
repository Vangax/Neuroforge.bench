import { useEffect, useRef, useState } from "react";
import { Panel, Spinner } from "../../components/hud";
import Heatmap from "../../components/Heatmap";
import ScalpDots from "../../components/ScalpDots";
import { NoData } from "../preprocess/Preprocess";
import { mod, type ModuleProps, type DecodeResult } from "../../api/modules";

export default function BCI({ dataset }: ModuleProps) {
  const [clfs, setClfs] = useState<{ id: string; label: string }[]>([]);
  const [clf, setClf] = useState("lda");
  const [res, setRes] = useState<DecodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { mod.bciClassifiers().then((c) => setClfs(c.classifiers)).catch(() => {}); }, []);
  if (!dataset) return <NoData />;

  const run = async () => {
    setBusy(true); setErr(null);
    try { setRes(await mod.bciDecode(dataset.id, clf, 5)); } catch (e) { setErr(String(e)); }
    setBusy(false);
  };

  return (
    <div className="col">
      <Panel tag="M08" title="BCI / Neurotechnology Workbench" meta={dataset.label}>
        <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
          <div className="field"><label>decoder</label>
            <select className="nf" value={clf} onChange={(e) => setClf(e.target.value)}>
              {clfs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <button className="btn crim" disabled={busy} onClick={run}>{busy ? "training…" : "▸ train & cross-validate"}</button>
          <span className="tiny dim">task: decode posterior alpha state (median split) · 5-fold CV</span>
          {err && <span className="tiny crim">{err}</span>}
        </div>
      </Panel>

      {busy ? <Spinner label="fitting CSP + classifier" /> : res && (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <Metric label="accuracy" value={`${(res.accuracy * 100).toFixed(1)}%`} big />
            <Metric label="cohen κ" value={res.kappa.toFixed(3)} />
            <Metric label="AUC" value={Number.isNaN(res.auc) ? "—" : res.auc.toFixed(3)} />
            <Metric label="ITR" value={`${res.itr.toFixed(1)} b/min`} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "260px minmax(0,1fr) 300px", alignItems: "start" }}>
            <Panel tag="CM" title="confusion">
              <Heatmap matrix={res.confusion} rowLabels={res.classes} colLabels={res.classes} cellText height={150} />
              <div className="tiny dim" style={{ textAlign: "center", marginTop: 4 }}>rows = truth · cols = predicted</div>
            </Panel>

            <Panel tag="RT" title="simulated real-time control signal" meta={`${res.n_epochs} windows`} bodyClass="tight">
              <ControlStrip res={res} />
            </Panel>

            <Panel tag="CSP" title="spatial patterns">
              {res.patterns ? (
                <div className="row" style={{ justifyContent: "space-around" }}>
                  {res.patterns.map((p) => (
                    <div key={p.comp} className="col" style={{ alignItems: "center", gap: 2 }}>
                      <ScalpDots values={p.values} diverging size={120} />
                      <span className="tiny dim">CSP {p.comp + 1}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="placeholder-note">Riemannian decoder — no spatial filters (operates on covariance manifold).</div>}
            </Panel>
          </div>

          <Panel tag="CV" title="per-fold accuracy" bodyClass="tight">
            <div className="row" style={{ gap: 8, padding: 12, alignItems: "flex-end", height: 90 }}>
              {res.folds_acc.map((a, i) => (
                <div key={i} className="col" style={{ alignItems: "center", gap: 4, flex: 1 }}>
                  <div style={{ width: "70%", height: `${a * 60}px`, background: "linear-gradient(180deg,var(--crimson),var(--gold))" }} />
                  <span className="tiny dim">f{i + 1}</span><span className="tiny gold">{(a * 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <Panel tag="" title={label}>
      <div className="disp" style={{ fontSize: big ? 34 : 26, fontWeight: 600, color: big ? "var(--crimson-hi)" : "var(--gold-hi)", textShadow: big ? "var(--glow-crim)" : "var(--glow-gold)", letterSpacing: "0.05em" }}>{value}</div>
    </Panel>
  );
}

function ControlStrip({ res }: { res: DecodeResult }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current; if (!wrap || !canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = 120;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const n = res.control.length, bw = W / n;
      // truth row + predicted row
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = res.truth[i] ? "rgba(255,47,94,0.8)" : "rgba(255,178,46,0.7)";
        ctx.fillRect(i * bw, 8, Math.ceil(bw), 16);
        const ok = res.truth[i] === res.control[i];
        ctx.fillStyle = res.control[i] ? "rgba(255,47,94,0.8)" : "rgba(255,178,46,0.7)";
        ctx.globalAlpha = ok ? 1 : 0.4; ctx.fillRect(i * bw, 30, Math.ceil(bw), 16); ctx.globalAlpha = 1;
        if (!ok) { ctx.fillStyle = "#fff"; ctx.fillRect(i * bw, 46, Math.ceil(bw), 2); }
      }
      // probability line
      ctx.strokeStyle = "rgba(245,232,223,0.9)"; ctx.lineWidth = 1.2; ctx.beginPath();
      res.proba.forEach((p, i) => { const x = i * bw + bw / 2, y = 110 - p * 56; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.fillStyle = "rgba(184,150,118,0.85)"; ctx.font = "8px 'Share Tech Mono', monospace";
      ctx.fillText("truth", 4, 6); ctx.fillText("decoded", 4, 64); ctx.fillText("P(high-α)", 4, 60 + 50);
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(wrap); return () => ro.disconnect();
  }, [res]);
  return <div ref={wrapRef} style={{ width: "100%", padding: 10 }}><canvas ref={canRef} style={{ display: "block" }} /></div>;
}
