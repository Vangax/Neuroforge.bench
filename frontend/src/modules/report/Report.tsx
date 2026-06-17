import { useEffect, useState } from "react";
import { Panel, Spinner, KV } from "../../components/hud";
import { NoData } from "../preprocess/Preprocess";
import { mod, type ModuleProps } from "../../api/modules";

export default function Report({ dataset }: ModuleProps) {
  const [formats, setFormats] = useState<{ fmt: string; label: string }[]>([]);
  const [env, setEnv] = useState<{ environment: Record<string, string>; repro_hash: string } | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = dataset?.id;

  useEffect(() => { mod.reportFormats().then((f) => setFormats(f.export_formats)).catch(() => {}); }, []);
  useEffect(() => { setEnv(null); setHtml(null); if (id) mod.reportEnv(id).then(setEnv).catch(() => {}); }, [id]);

  if (!dataset) return <NoData />;

  const gen = async () => { setBusy(true); try { setHtml(await mod.reportHtml(dataset.id)); } catch { /* */ } setBusy(false); };

  return (
    <div className="grid" style={{ gridTemplateColumns: "300px minmax(0,1fr)", alignItems: "start" }}>
      <div className="col">
        <Panel tag="M10" title="Reporting & Export" meta={dataset.label}>
          <div className="col" style={{ gap: 12 }}>
            <button className="btn crim" disabled={busy} onClick={gen}>{busy ? "rendering…" : "▣ generate report"}</button>
            <div>
              <div className="tiny up dim" style={{ marginBottom: 6 }}>export dataset ›</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {formats.map((f) => (
                  <a key={f.fmt} className="btn sm" href={mod.exportUrl(dataset.id, f.fmt)} target="_blank" rel="noreferrer" title={f.label}>{f.fmt.toUpperCase()}</a>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel tag="ENV" title="Reproducibility">
          {!env ? <Spinner /> : (
            <KV items={[
              ["python", env.environment.python],
              ["mne", env.environment.mne],
              ["numpy", env.environment.numpy],
              ["platform", env.environment.platform?.split("-")[0] ?? "?"],
              ["data hash", env.repro_hash, true],
            ]} />
          )}
        </Panel>
      </div>

      <Panel tag="DOC" title="Report Preview" meta={html ? "html · embedded figures" : "not generated"} bodyClass="tight">
        {busy ? <Spinner label="rendering matplotlib figures" />
          : html ? <iframe title="report" srcDoc={html} style={{ width: "100%", height: 620, border: "none", background: "#0a0609" }} />
            : <div className="placeholder-note" style={{ padding: 16 }}>Generate a publication-style HTML report with embedded PSD &amp; topography figures, dataset metadata and full provenance. Export derivatives as FIF / CSV / NumPy / HDF5 / EDF (BIDS-preserving).</div>}
      </Panel>
    </div>
  );
}
