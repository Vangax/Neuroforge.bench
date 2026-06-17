import { useEffect, useState } from "react";
import { Panel, Spinner, KV } from "../../components/hud";
import Heatmap from "../../components/Heatmap";
import { mod, type ModuleProps, type MapperOverview, type MapperMatrix } from "../../api/modules";
import { cg } from "../../lib/format";

const BANDS = ["delta", "theta", "alpha", "beta", "gamma"];

export default function Mapper(_props: ModuleProps) {
  const [ov, setOv] = useState<MapperOverview | null>(null);
  const [mat, setMat] = useState<MapperMatrix | null>(null);
  const [metric, setMetric] = useState("alpha");

  useEffect(() => { mod.mapperOverview().then(setOv).catch(() => {}); }, []);
  useEffect(() => { setMat(null); mod.mapperMatrix(metric).then(setMat).catch(() => {}); }, [metric]);

  return (
    <div className="col">
      <Panel tag="M06" title="Cross-Session / Cross-Subject Mapper" meta={ov ? `${ov.datasets.length} datasets` : ""} bodyClass="tight" style={{ maxHeight: 300 }}>
        {!ov ? <Spinner label="scanning cohort" /> : (
          <table className="nf">
            <thead><tr><th>dataset</th><th>subject</th><th>session</th><th>task</th>{ov.bands.map((b) => <th key={b}>{b}</th>)}</tr></thead>
            <tbody>
              {ov.datasets.map((d) => (
                <tr key={d.id}>
                  <td className="crim">{d.label}</td><td>{d.subject}</td><td>{d.session ?? "—"}</td><td>{d.task ?? "—"}</td>
                  {ov.bands.map((b) => {
                    const v = d.summary[b] ?? 0;
                    return <td key={b}><span style={{ display: "inline-block", height: 8, width: `${Math.min(100, v * 300)}px`, background: cg(v * 3), marginRight: 4, verticalAlign: "middle" }} />{(v * 100).toFixed(0)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", alignItems: "start" }}>
        <Panel tag="MAP" title={`${metric} power · datasets × channels`}>
          <div className="field" style={{ marginBottom: 10, maxWidth: 140 }}><label>metric band</label>
            <select className="nf" value={metric} onChange={(e) => setMetric(e.target.value)}>{BANDS.map((b) => <option key={b}>{b}</option>)}</select>
          </div>
          {!mat ? <Spinner /> : <Heatmap matrix={mat.rows.map((r) => r.values)} rowLabels={mat.labels} height={Math.max(120, mat.rows.length * 40)} />}
        </Panel>
        <Panel tag="ICC" title="Session Similarity" meta={mat ? `r̄ = ${mat.mean_reliability.toFixed(2)}` : ""}>
          {!mat ? <Spinner /> : mat.rows.length < 2 ? <div className="placeholder-note">Need ≥2 datasets for a similarity matrix. Forge more synthetic runs in <span className="gold">Module 01</span>.</div> : (
            <div className="col" style={{ gap: 12 }}>
              <Heatmap matrix={mat.similarity} rowLabels={mat.labels} min={-1} max={1} height={Math.max(120, mat.labels.length * 36)} />
              <KV items={[["mean reliability", mat.mean_reliability.toFixed(3), true], ["datasets", mat.rows.length], ["interpretation", mat.mean_reliability > 0.7 ? "high test-retest" : mat.mean_reliability > 0.4 ? "moderate" : "low"]]} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
