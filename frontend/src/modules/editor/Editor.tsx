import { useEffect, useState } from "react";
import { Panel, Spinner, Chip } from "../../components/hud";
import { NoData } from "../preprocess/Preprocess";
import { api, type ChannelsData } from "../../api/client";
import { mod, type ModuleProps } from "../../api/modules";

export default function Editor({ dataset, onChanged }: ModuleProps) {
  const [ch, setCh] = useState<ChannelsData | null>(null);
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const [anode, setAnode] = useState(""); const [cathode, setCathode] = useState("");
  const [crop, setCrop] = useState({ tmin: 0, tmax: 0 });
  const [annot, setAnnot] = useState({ onset: 0, duration: 0, description: "mark" });
  const [msg, setMsg] = useState<string | null>(null);
  const [montages, setMontages] = useState<string[]>([]);
  const [montage, setMontage] = useState("standard_1020");
  const id = dataset?.id;

  useEffect(() => { mod.editMontages().then((m) => setMontages(m.montages)).catch(() => {}); }, []);

  useEffect(() => {
    setCh(null); setDrop(new Set());
    if (id) api.channels(id).then((c) => { setCh(c); setAnode(c.channels[0]?.name ?? ""); setCathode(c.channels[1]?.name ?? ""); });
  }, [id]);
  useEffect(() => { if (dataset) setCrop({ tmin: 0, tmax: Math.round(dataset.duration) }); }, [dataset]);

  if (!dataset) return <NoData />;

  const after = (label: string) => (m: { label: string; id: string }) => { setMsg(`${label} → ${m.label} [${m.id}]`); onChanged(); };
  const fail = (e: unknown) => setMsg(`✕ ${e}`);
  const toggle = (n: string) => setDrop((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });

  return (
    <div className="grid" style={{ gridTemplateColumns: "320px minmax(0,1fr) 300px", alignItems: "start" }}>
      <Panel tag="CH" title="Channels" meta={ch ? `${ch.channels.length}` : ""} bodyClass="tight" style={{ maxHeight: 520 }}>
        {!ch ? <Spinner /> : (
          <table className="nf">
            <thead><tr><th>drop</th><th>name</th><th>type</th></tr></thead>
            <tbody>{ch.channels.map((c) => (
              <tr key={c.name}>
                <td><input type="checkbox" checked={drop.has(c.name)} onChange={() => toggle(c.name)} /></td>
                <td className={drop.has(c.name) ? "dim" : "crim"} style={{ textDecoration: drop.has(c.name) ? "line-through" : "none" }}>{c.name}</td>
                <td className="dim">{c.type}</td>
              </tr>))}</tbody>
          </table>
        )}
        <div style={{ padding: 8 }}>
          <button className="btn sm crim" disabled={!drop.size} onClick={() => mod.editChannels(dataset.id, { drop: [...drop] }).then(after("drop channels")).catch(fail)}>drop {drop.size} channel(s)</button>
        </div>
      </Panel>

      <div className="col">
        <Panel tag="M09" title="Data Editor & Annotation" meta={dataset.label}>
          <div className="col" style={{ gap: 16 }}>
            <div>
              <div className="tiny up dim" style={{ marginBottom: 6 }}>virtual channel (bipolar derivation) ›</div>
              <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
                <div className="field"><label>anode</label><select className="nf" value={anode} onChange={(e) => setAnode(e.target.value)}>{ch?.channels.map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
                <span className="gold">−</span>
                <div className="field"><label>cathode</label><select className="nf" value={cathode} onChange={(e) => setCathode(e.target.value)}>{ch?.channels.map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
                <button className="btn sm" onClick={() => mod.editVirtual(dataset.id, { anode, cathode, name: `${anode}-${cathode}` }).then(after("virtual ch")).catch(fail)}>+ create {anode}-{cathode}</button>
              </div>
            </div>
            <div>
              <div className="tiny up dim" style={{ marginBottom: 6 }}>crop time window (s) ›</div>
              <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
                <div className="field"><label>tmin</label><input className="nf" style={{ width: 80 }} type="number" value={crop.tmin} onChange={(e) => setCrop({ ...crop, tmin: +e.target.value })} /></div>
                <div className="field"><label>tmax</label><input className="nf" style={{ width: 80 }} type="number" value={crop.tmax} onChange={(e) => setCrop({ ...crop, tmax: +e.target.value })} /></div>
                <button className="btn sm" onClick={() => mod.editCrop(dataset.id, { tmin: crop.tmin, tmax: crop.tmax }).then(after("crop")).catch(fail)}>✂ crop</button>
              </div>
            </div>
            <div>
              <div className="tiny up dim" style={{ marginBottom: 6 }}>add annotation ›</div>
              <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
                <div className="field"><label>onset</label><input className="nf" style={{ width: 70 }} type="number" value={annot.onset} onChange={(e) => setAnnot({ ...annot, onset: +e.target.value })} /></div>
                <div className="field"><label>dur</label><input className="nf" style={{ width: 60 }} type="number" value={annot.duration} onChange={(e) => setAnnot({ ...annot, duration: +e.target.value })} /></div>
                <div className="field"><label>label</label><input className="nf" style={{ width: 110 }} value={annot.description} onChange={(e) => setAnnot({ ...annot, description: e.target.value })} /></div>
                <button className="btn sm" onClick={() => mod.editAnnotation(dataset.id, annot).then(after("annotation")).catch(fail)}>+ mark</button>
              </div>
            </div>
            <div>
              <div className="tiny up dim" style={{ marginBottom: 6 }}>set montage (electrode positions) ›</div>
              <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
                <div className="field"><label>standard montage</label>
                  <select className="nf" value={montage} onChange={(e) => setMontage(e.target.value)} style={{ minWidth: 160 }}>
                    {montages.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select></div>
                <button className="btn sm" onClick={() => mod.editMontage(dataset.id, montage).then(after("montage")).catch(fail)}>apply montage</button>
              </div>
            </div>
            {msg && <div className="tiny" style={{ color: msg.startsWith("✕") ? "var(--crimson-hi)" : "var(--gold-hi)" }}>» {msg}</div>}
            <div className="placeholder-note tiny">Every edit forks a non-destructive BIDS derivative with a provenance step linked to its parent — git-like dataset versioning.</div>
          </div>
        </Panel>

        <Panel tag="VER" title="Version History" meta={dataset.extra?.parent ? `parent ${String(dataset.extra.parent)}` : "root"}>
          <div className="col" style={{ gap: 3 }}>
            {dataset.provenance.map((p, i) => (
              <div key={i} className="tiny"><span className="crim">{String(i).padStart(2, "0")}</span> <span className="gold">{p.op}</span> <span className="dim">{JSON.stringify(p.params)}</span></div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}><Chip kind="ok">audit trail · {dataset.provenance.length} steps</Chip></div>
        </Panel>
      </div>

      <Panel tag="i" title="Selected">
        <div className="placeholder-note tiny">Edits create new datasets — switch to them via the top-bar selector or <span className="gold">Module 01</span>. The current selection is the edit source.</div>
      </Panel>
    </div>
  );
}
