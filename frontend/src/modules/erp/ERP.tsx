import { useEffect, useRef, useState } from "react";
import { Panel, Spinner, KV } from "../../components/hud";
import ScalpDots from "../../components/ScalpDots";
import { NoData } from "../preprocess/Preprocess";
import { mod, type ModuleProps, type ERPResult } from "../../api/modules";

const COLORS = ["rgba(255,200,90,0.95)", "rgba(255,47,94,0.95)", "rgba(140,230,255,0.9)"];

export default function ERP({ dataset }: ModuleProps) {
  const [conds, setConds] = useState<{ name: string; count: number }[]>([]);
  const [res, setRes] = useState<ERPResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = dataset?.id;

  useEffect(() => {
    setRes(null); setConds([]);
    if (id) mod.erpConditions(id).then((c) => setConds(c.conditions)).catch(() => setErr("backend required"));
  }, [id]);

  if (!dataset) return <NoData />;

  const compute = async () => {
    setBusy(true); setErr(null);
    try { setRes(await mod.erpCompute(dataset.id, { tmin: -0.2, tmax: 0.6, baseline_end: 0.0, stats: true })); }
    catch (e) { setErr(String(e)); }
    setBusy(false);
  };

  return (
    <div className="col">
      <Panel tag="M04" title="ERP / ERF Analyzer" meta={dataset.label}>
        <div className="row wrap" style={{ gap: 14, alignItems: "center" }}>
          <button className="btn crim" disabled={busy} onClick={compute}>{busy ? "epoching…" : "▸ compute evoked"}</button>
          <span className="tiny up dim">conditions:</span>
          {conds.map((c) => <span key={c.name} className="chip">{c.name} · {c.count}</span>)}
          {err && <span className="tiny crim">{err}</span>}
        </div>
      </Panel>

      {!res ? (busy ? <Spinner label="averaging epochs" /> : null) : (
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.5fr) 300px" }}>
          <Panel tag="ERP" title="evoked response · mean over channels" meta="µV / ms" bodyClass="tight">
            <ERPPlot res={res} />
          </Panel>
          <div className="col">
            {res.difference && (
              <Panel tag="TOPO" title="difference @ peak" meta={`${res.difference.topo.latency_ms} ms`}>
                <ScalpDots values={res.difference.topo.positions} diverging size={200} />
                <div className="tiny dim" style={{ textAlign: "center", marginTop: 4 }}>{res.difference.name}</div>
              </Panel>
            )}
            <Panel tag="PK" title="measurements">
              <KV items={[
                ...res.conditions.map((c) => [`${c.name}`, `${c.peak.amp_uv.toFixed(2)} µV @ ${c.peak.latency_ms}ms`] as [string, string]),
                ...(res.difference ? [["difference", `${res.difference.peak.amp_uv.toFixed(2)} µV @ ${res.difference.peak.latency_ms}ms`, true] as [string, string, boolean]] : []),
                ["sig. clusters", res.clusters?.length ? res.clusters.map((c) => `${c.start_ms}–${c.end_ms}ms (p=${c.p.toFixed(3)})`).join(", ") : "none (p<.05)"],
              ]} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function ERPPlot({ res }: { res: ERPResult }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canRef.current; if (!wrap || !canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = 320;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const t = res.times_ms; const ml = 42, mr = 12, mt = 12, mb = 26, pw = W - ml - mr, ph = H - mt - mb;
      const series = [...res.conditions.map((c) => c.wave), ...(res.difference ? [res.difference.wave] : [])];
      let lo = Infinity, hi = -Infinity; for (const s of series) for (const v of s) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
      const X = (ms: number) => ml + ((ms - t[0]) / (t[t.length - 1] - t[0])) * pw;
      const Y = (uv: number) => mt + (1 - (uv - lo) / (hi - lo)) * ph;

      // sig clusters shading
      for (const cl of res.clusters ?? []) {
        ctx.fillStyle = "rgba(255,47,94,0.12)";
        ctx.fillRect(X(cl.start_ms), mt, X(cl.end_ms) - X(cl.start_ms), ph);
      }
      // axes: zero lines
      ctx.strokeStyle = "rgba(255,178,46,0.25)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(0), mt); ctx.lineTo(X(0), mt + ph); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ml, Y(0)); ctx.lineTo(ml + pw, Y(0)); ctx.stroke();
      ctx.fillStyle = "rgba(184,150,118,0.8)"; ctx.font = "9px 'Share Tech Mono', monospace";
      for (let ms = Math.ceil(t[0] / 100) * 100; ms <= t[t.length - 1]; ms += 100) { ctx.fillText(ms + "", X(ms) - 8, H - 8); }
      ctx.fillText(hi.toFixed(0), 4, Y(hi) + 8); ctx.fillText(lo.toFixed(0), 4, Y(lo)); ctx.fillText("µV", 4, mt + 8);

      series.forEach((s, idx) => {
        const isDiff = res.difference && idx === series.length - 1;
        ctx.strokeStyle = isDiff ? "rgba(245,232,223,0.95)" : COLORS[idx % COLORS.length];
        ctx.lineWidth = isDiff ? 1.3 : 1.8; ctx.setLineDash(isDiff ? [4, 3] : []);
        ctx.beginPath(); s.forEach((v, i) => { const x = X(t[i]), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
        ctx.setLineDash([]);
      });
      // legend
      let lx = ml + 6;
      [...res.conditions.map((c) => c.name), ...(res.difference ? [res.difference.name] : [])].forEach((nm, idx) => {
        const isDiff = res.difference && idx === series.length - 1;
        ctx.fillStyle = isDiff ? "rgba(245,232,223,0.95)" : COLORS[idx % COLORS.length];
        ctx.fillRect(lx, mt + 2, 10, 3); ctx.fillStyle = "rgba(196,179,171,0.9)";
        ctx.fillText(nm, lx + 14, mt + 7); lx += 18 + nm.length * 6.2;
      });
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(wrap); return () => ro.disconnect();
  }, [res]);
  return <div ref={wrapRef} style={{ width: "100%" }}><canvas ref={canRef} style={{ display: "block" }} /></div>;
}
