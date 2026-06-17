import { useEffect, useState } from "react";
import { Panel, Spinner, KV, Chip } from "../../components/hud";
import Heatmap from "../../components/Heatmap";
import { NoData } from "../preprocess/Preprocess";
import { mod, type ModuleProps, type BenchResult, type QualityResult } from "../../api/modules";

export default function Bench({ dataset }: ModuleProps) {
  const [res, setRes] = useState<BenchResult | null>(null);
  const [qual, setQual] = useState<QualityResult | null>(null);
  const [busy, setBusy] = useState(false);
  const id = dataset?.id;

  useEffect(() => { setQual(null); if (id) mod.benchQuality(id).then(setQual).catch(() => {}); }, [id]);
  if (!dataset) return <NoData />;

  const run = async () => { setBusy(true); try { setRes(await mod.benchPipelines(dataset.id)); } catch { /* */ } setBusy(false); };
  const maxSnr = res ? Math.max(...res.results.map((r) => r.alpha_snr_db)) : 1;
  const maxT = res ? Math.max(...res.results.map((r) => r.time_ms)) : 1;

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", alignItems: "start" }}>
      <Panel tag="M07" title="Pipeline Benchmark" meta={dataset.label}>
        <button className="btn crim" disabled={busy} onClick={run} style={{ marginBottom: 12 }}>{busy ? "benchmarking…" : "▸ run pipeline shootout"}</button>
        {!res ? <div className="placeholder-note">Compares preprocessing variants (raw · hp · hp+notch · hp+notch+ICA) on alpha-band SNR and runtime.</div> : (
          <table className="nf">
            <thead><tr><th>pipeline</th><th>α-SNR (dB)</th><th></th><th>time</th><th>ICA</th></tr></thead>
            <tbody>
              {res.results.map((r) => (
                <tr key={r.name}>
                  <td className={r.name === res.best ? "crim" : ""}>{r.name === res.best ? "★ " : ""}{r.name}</td>
                  <td className="gold">{r.alpha_snr_db.toFixed(2)}</td>
                  <td style={{ width: 90 }}><span style={{ display: "inline-block", height: 7, width: `${Math.max(2, (r.alpha_snr_db / maxSnr) * 80)}px`, background: "var(--gold)" }} /></td>
                  <td className="dim">{r.time_ms.toFixed(0)}ms<span style={{ display: "inline-block", height: 7, marginLeft: 4, width: `${Math.max(1, (r.time_ms / maxT) * 40)}px`, background: "var(--crimson-deep)" }} /></td>
                  <td className="dim">{r.ica_removed || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="col">
        <Panel tag="QC" title="Data Quality" meta={qual ? `α-SNR ${qual.alpha_snr_db.toFixed(1)} dB` : ""}>
          {!qual ? <Spinner /> : (
            <div className="col" style={{ gap: 10 }}>
              <div className="tiny up dim">channel correlation matrix</div>
              <Heatmap matrix={qual.correlation} min={-1} max={1} height={200} />
              <KV items={[["mean |corr|", qual.mean_abs_corr.toFixed(3)], ["alpha SNR", `${qual.alpha_snr_db.toFixed(2)} dB`, true], ["channels", qual.ch_names.length]]} />
            </div>
          )}
        </Panel>
        {res && (
          <Panel tag="REPRO" title="Reproducibility">
            <KV items={[
              ["python", res.environment.python], ["mne", res.environment.mne],
              ["numpy", res.environment.numpy], ["data hash", res.repro_hash, true],
            ]} />
            <div className="row" style={{ marginTop: 8 }}><Chip kind="ok">environment captured</Chip></div>
          </Panel>
        )}
      </div>
    </div>
  );
}
