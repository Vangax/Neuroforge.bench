import { useEffect, useRef, useState } from "react";
import { Panel, Chip } from "../../components/hud";
import { mod, type ModuleProps, type StepDef, type QC } from "../../api/modules";

export default function Preprocess({ dataset, onChanged }: ModuleProps) {
  const [catalog, setCatalog] = useState<StepDef[]>([]);
  const [steps, setSteps] = useState<StepDef[]>([]);
  const [qc, setQc] = useState<QC | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { mod.prepCatalog().then((c) => setCatalog(c.catalog)).catch(() => setErr("backend required")); }, []);

  if (!dataset) return <NoData />;

  const add = (s: StepDef) => setSteps((p) => [...p, { op: s.op, label: s.label, params: { ...s.params } }]);
  const remove = (i: number) => setSteps((p) => p.filter((_, k) => k !== i));
  const setParam = (i: number, key: string, val: unknown) =>
    setSteps((p) => p.map((s, k) => (k === i ? { ...s, params: { ...s.params, [key]: val } } : s)));

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await mod.prepRun(dataset.id, steps.map((s) => ({ op: s.op, params: s.params })));
      setQc(r.qc); onChanged();
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", alignItems: "start" }}>
      <div className="col">
        <Panel tag="M03" title="Pipeline Builder" meta={dataset.label}>
          <div className="tiny up dim" style={{ marginBottom: 6 }}>add step ›</div>
          <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
            {catalog.map((s) => (
              <button key={s.op} className="btn sm" onClick={() => add(s)}>+ {s.label}</button>
            ))}
          </div>
          <div className="col" style={{ gap: 8 }}>
            {steps.length === 0 && <div className="placeholder-note">Empty pipeline — add steps above, then execute.</div>}
            {steps.map((s, i) => (
              <div key={i} className="panel" style={{ background: "rgba(0,0,0,0.25)" }}>
                <div className="row" style={{ justifyContent: "space-between", padding: "5px 8px", borderBottom: "1px solid var(--line)" }}>
                  <span><span className="crim">{String(i + 1).padStart(2, "0")}</span> <span className="gold up" style={{ letterSpacing: "0.12em" }}>{s.label}</span></span>
                  <button className="btn sm crim" onClick={() => remove(i)}>✕</button>
                </div>
                <div className="row wrap" style={{ gap: 8, padding: 8 }}>
                  {Object.entries(s.params).map(([k, v]) => (
                    <div className="field" key={k} style={{ minWidth: 92 }}>
                      <label>{k}</label>
                      <input className="nf" style={{ width: 92 }} defaultValue={v == null ? "" : String(v)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = raw === "" ? null : Number(raw);
                          setParam(i, k, raw !== "" && !Number.isNaN(num) ? num : raw);
                        }} />
                    </div>
                  ))}
                  {Object.keys(s.params).length === 0 && <span className="tiny dim">no parameters</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn crim" disabled={busy || !steps.length} onClick={run}>{busy ? "executing…" : "▸ execute pipeline"}</button>
            {err && <span className="tiny crim">{err}</span>}
          </div>
        </Panel>
      </div>

      <div className="col">
        <Panel tag="QC" title="Quality Control" meta={qc ? `→ ${qc.new_id}` : "awaiting run"}>
          {!qc ? <div className="placeholder-note">Run a pipeline to see before/after spectra, detected bad channels and removed ICA components. The result is saved as a new BIDS derivative.</div>
            : (
              <div className="col" style={{ gap: 14 }}>
                <div>
                  <div className="tiny up dim" style={{ marginBottom: 4 }}>mean PSD · <span className="gold">before</span> → <span className="crim">after</span></div>
                  <PSDCompare before={qc.psd_before} after={qc.psd_after} />
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="tiny up dim">bad channels:</span>
                  {qc.detected_bads.length ? qc.detected_bads.map((b) => <Chip key={b}>{b}</Chip>) : <span className="tiny gold">none</span>}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="tiny up dim">ICA removed:</span>
                  {qc.ica_excluded.length ? qc.ica_excluded.map((c) => <Chip key={c} kind="ok">IC{c}</Chip>) : <span className="tiny dim">—</span>}
                </div>
                <div>
                  <div className="tiny up dim" style={{ marginBottom: 4 }}>applied ›</div>
                  {qc.applied.map((a, i) => (
                    <div key={i} className="tiny" style={{ color: a.error ? "var(--crimson-hi)" : "var(--txt)" }}>
                      <span className="crim">{String(i + 1).padStart(2, "0")}</span> <span className="gold">{a.op}</span> <span className="dim">{JSON.stringify(a.params)}</span>{a.error ? ` ✕ ${a.error}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </Panel>
      </div>
    </div>
  );
}

function PSDCompare({ before, after }: { before: { freqs: number[]; mean: number[] }; after: { freqs: number[]; mean: number[] } }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current; if (!wrap || !canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = 180;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const all = [...before.mean, ...after.mean]; let lo = Math.min(...all), hi = Math.max(...all);
      const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
      const fmax = Math.max(...before.freqs);
      const X = (f: number) => 36 + (f / fmax) * (W - 44), Y = (d: number) => 8 + (1 - (d - lo) / (hi - lo)) * (H - 26);
      const line = (s: { freqs: number[]; mean: number[] }, col: string) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
        s.freqs.forEach((f, i) => { const x = X(f), y = Y(s.mean[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      };
      ctx.strokeStyle = "rgba(255,47,94,0.08)";
      [0, 10, 20, 30, 40].forEach((f) => { if (f <= fmax) { ctx.beginPath(); ctx.moveTo(X(f), 8); ctx.lineTo(X(f), H - 18); ctx.stroke(); } });
      ctx.fillStyle = "rgba(184,150,118,0.8)"; ctx.font = "8px 'Share Tech Mono', monospace";
      [0, 10, 20, 30, 40].forEach((f) => { if (f <= fmax) ctx.fillText(f + "", X(f) - 4, H - 6); });
      line(before, "rgba(255,200,90,0.9)"); line(after, "rgba(255,47,94,0.95)");
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(wrap); return () => ro.disconnect();
  }, [before, after]);
  return <div ref={wrapRef} style={{ width: "100%" }}><canvas ref={canRef} style={{ display: "block" }} /></div>;
}

export function NoData() {
  return (
    <div className="center" style={{ height: "60vh" }}>
      <Panel tag="…" title="no dataset"><div className="placeholder-note" style={{ padding: 8 }}>Select a dataset in <span className="gold">Module 01 · Repo</span> first.</div></Panel>
    </div>
  );
}
