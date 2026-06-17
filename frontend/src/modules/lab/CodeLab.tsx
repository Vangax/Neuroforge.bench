import { useEffect, useState } from "react";
import { Panel, Spinner, Chip } from "../../components/hud";
import { NoData } from "../preprocess/Preprocess";
import { api, type DatasetMeta } from "../../api/client";
import {
  mod, type ModuleProps, type ScriptMeta, type ScriptResult, type BatchResult, type ScriptRun,
} from "../../api/modules";

const STARTER = `# 'raw' is the (first) selected dataset's MNE Raw. In multi-dataset GROUP mode
# you also get 'raws' (list) and 'datasets' (metadata) to compare across them.
# 'params' is your JSON below. 'nf' exposes NeuroForge helpers (nf.band_powers, ...).
# Set 'result' (JSON-serialisable) or define run(raw, params). Figures are captured.

psd = raw.compute_psd(method="welch", fmin=1, fmax=40, verbose="ERROR")
p, f = psd.get_data(return_freqs=True)
alpha = p[:, (f >= 8) & (f <= 13)].mean(axis=1)
result = {"channels": raw.ch_names, "alpha_power": alpha.tolist()}
`;

export default function CodeLab({ dataset }: ModuleProps) {
  const [allDs, setAllDs] = useState<DatasetMeta[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"each" | "group">("each");
  const [code, setCode] = useState(STARTER);
  const [paramsText, setParamsText] = useState("{}");
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<ScriptResult | BatchResult | null>(null);
  const [scripts, setScripts] = useState<ScriptMeta[]>([]);
  const [examples, setExamples] = useState<{ name: string; code: string }[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [timeout, setTimeoutS] = useState(30);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.listDatasets().then((d) => setAllDs(d.datasets));
    mod.scriptsList().then((s) => { setScripts(s.scripts); setEnabled(s.enabled); setTimeoutS(s.timeout_s); }).catch(() => {});
    mod.scriptExamples().then((e) => setExamples(e.examples)).catch(() => {});
  }, []);
  useEffect(() => { if (dataset) setSel((s) => (s.size ? s : new Set([dataset.id]))); }, [dataset]);

  if (!dataset) return <NoData />;

  const toggle = (id: string) => setSel((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const ids = [...sel];

  const run = async () => {
    if (!ids.length) { setMsg("select at least one dataset"); return; }
    let params: Record<string, unknown> = {};
    try { params = paramsText.trim() ? JSON.parse(paramsText) : {}; }
    catch { setMsg("✕ params is not valid JSON"); return; }
    setRunning(true); setMsg(null); setOut(null);
    try { setOut(await mod.scriptRun(ids, code, params, mode)); }
    catch (e) { setMsg(`✕ ${e}`); }
    setRunning(false);
  };

  const save = async () => {
    if (!name.trim()) { setMsg("name your script first"); return; }
    await mod.scriptSave({ name: name.trim(), code });
    setMsg(`saved “${name.trim()}”`);
    mod.scriptsList().then((s) => setScripts(s.scripts));
  };
  const load = async (id: string) => { if (id) { const s = await mod.scriptGet(id); setCode(s.code); setName(s.name); } };

  const isBatch = out !== null && "runs" in out;

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", alignItems: "start" }}>
      <div className="col">
        <Panel tag="M11" title="Code Lab" meta={`${ids.length} dataset${ids.length === 1 ? "" : "s"}`}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
            <select className="nf" defaultValue="" onChange={(e) => { const ex = examples.find((x) => x.name === e.target.value); if (ex) setCode(ex.code); }}>
              <option value="">insert example…</option>
              {examples.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
            <select className="nf" defaultValue="" onChange={(e) => load(e.target.value)}>
              <option value="">load saved…</option>
              {scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {!enabled && <Chip kind="plan">scripting disabled on server</Chip>}
          </div>

          <textarea
            value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
            style={{
              width: "100%", height: 300, resize: "vertical", fontFamily: "var(--font-mono)",
              fontSize: 12.5, lineHeight: 1.5, color: "var(--gold-hi)", background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(0,0,0,0.5)", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
              padding: 10, outline: "none", tabSize: 4,
            }}
          />

          <div className="row wrap" style={{ gap: 12, alignItems: "flex-end", marginTop: 10 }}>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>params (JSON)</label>
              <input className="nf" value={paramsText} onChange={(e) => setParamsText(e.target.value)} />
            </div>
            {ids.length > 1 && (
              <div className="field">
                <label>multi-dataset</label>
                <select className="nf" value={mode} onChange={(e) => setMode(e.target.value as "each" | "group")}>
                  <option value="each">run on each</option>
                  <option value="group">group (all at once)</option>
                </select>
              </div>
            )}
            <button className="btn crim" disabled={running || !enabled} onClick={run}>
              {running ? "running…" : `▸ run · ${ids.length}`}
            </button>
          </div>
          <div className="row wrap" style={{ gap: 8, alignItems: "flex-end", marginTop: 8 }}>
            <div className="field" style={{ flex: 1, minWidth: 150 }}><label>save as</label>
              <input className="nf" value={name} onChange={(e) => setName(e.target.value)} placeholder="script name" /></div>
            <button className="btn sm" onClick={save}>save</button>
          </div>
          {msg && <div className="tiny" style={{ marginTop: 8, color: msg.startsWith("✕") ? "var(--crimson-hi)" : "var(--gold-hi)" }}>{msg}</div>}
          <div className="placeholder-note tiny" style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            Isolated subprocess ({timeout}s each). Scope: <span className="gold">np, scipy, pd, mne, plt, sklearn, nf, raw, raws, datasets, params</span>.
          </div>
        </Panel>

        <Panel tag="SET" title="Datasets" meta="run targets">
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <button className="btn sm" onClick={() => setSel(new Set(allDs.map((d) => d.id)))}>select all</button>
            <button className="btn sm" onClick={() => setSel(new Set([dataset.id]))}>current only</button>
          </div>
          <div className="col" style={{ gap: 2, maxHeight: 200, overflow: "auto" }}>
            {allDs.map((d) => (
              <label key={d.id} className="row" style={{ gap: 8, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={sel.has(d.id)} onChange={() => toggle(d.id)} />
                <span className={sel.has(d.id) ? "crim" : ""}>{d.label}</span>
                <span className="tiny dim" style={{ marginLeft: "auto" }}>{d.n_channels}ch·{d.duration.toFixed(0)}s</span>
              </label>
            ))}
          </div>
        </Panel>
      </div>

      <Panel tag="OUT" title="result" meta={out && !isBatch && (out as ScriptResult).duration != null ? `${(out as ScriptResult).duration}s` : ""} bodyClass="tight">
        {running ? <Spinner label="executing in subprocess" />
          : !out ? <div className="placeholder-note" style={{ padding: 14 }}>Run a script to see its return value, captured stdout and any figures. Select multiple datasets to run across a cohort.</div>
            : isBatch ? <BatchView batch={out as BatchResult} />
              : <SingleView res={out as ScriptResult} />}
      </Panel>
    </div>
  );
}

function ErrorBlock({ res }: { res: { error?: string; error_type?: string } }) {
  const sys = res.error_type === "system";
  return (
    <div style={{ padding: 12 }}>
      <div className="tiny up" style={{ marginBottom: 4, color: sys ? "var(--gold-hi)" : "var(--crimson-hi)" }}>
        {sys ? "⚠ platform error (please report)" : "✕ error in your code"}
      </div>
      <pre style={{ margin: 0, color: "var(--crimson-hi)", fontSize: 11, whiteSpace: "pre-wrap", overflow: "auto" }}>{res.error}</pre>
    </div>
  );
}

function SingleView({ res }: { res: ScriptResult }) {
  if (!res.ok) return <ErrorBlock res={res} />;
  return (
    <div className="col" style={{ gap: 0 }}>
      {!!res.figures?.length && (
        <div style={{ padding: 10, borderBottom: "1px solid var(--line)" }}>
          {res.figures.map((src, i) => <img key={i} src={src} style={{ width: "100%", marginBottom: 8, border: "1px solid var(--line)" }} />)}
        </div>
      )}
      <div style={{ padding: 10 }}>
        <div className="tiny up dim" style={{ marginBottom: 4 }}>result ›</div>
        <pre style={{ margin: 0, fontSize: 11, color: "var(--txt-bright)", whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>{JSON.stringify(res.result, null, 2)}</pre>
      </div>
      {!!res.stdout?.trim() && (
        <div style={{ padding: 10, borderTop: "1px solid var(--line)" }}>
          <div className="tiny up dim" style={{ marginBottom: 4 }}>stdout ›</div>
          <pre style={{ margin: 0, fontSize: 11, color: "var(--txt-dim)", whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto" }}>{res.stdout}</pre>
        </div>
      )}
    </div>
  );
}

function BatchView({ batch }: { batch: BatchResult }) {
  return (
    <div className="col" style={{ gap: 0 }}>
      <div className="row" style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)", gap: 8 }}>
        <span className="tiny up dim">cohort · {batch.n} runs</span>
        <Chip kind={batch.ok ? "ok" : "plan"}>{batch.runs.filter((r) => r.ok).length}/{batch.n} ok</Chip>
      </div>
      {batch.runs.map((r: ScriptRun) => (
        <details key={r.dataset_id} style={{ borderBottom: "1px solid var(--line)" }}>
          <summary style={{ padding: "6px 10px", cursor: "pointer", listStyle: "none", display: "flex", gap: 8, alignItems: "center" }}>
            <span className="dot" style={{ background: r.ok ? "var(--gold)" : "var(--crimson)", boxShadow: "none" }} />
            <span className="crim" style={{ fontSize: 12 }}>{r.label}</span>
            <span className="tiny dim" style={{ marginLeft: "auto" }}>{r.ok ? `${r.duration}s` : (r.error_type === "system" ? "platform err" : "code err")}</span>
          </summary>
          <div style={{ padding: "0 10px 10px" }}>
            {r.ok
              ? <pre style={{ margin: 0, fontSize: 11, color: "var(--txt-bright)", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{JSON.stringify(r.result, null, 2)}</pre>
              : <pre style={{ margin: 0, fontSize: 11, color: "var(--crimson-hi)", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{r.error}</pre>}
            {!!r.figures?.length && r.figures.map((src, i) => <img key={i} src={src} style={{ width: "100%", marginTop: 8, border: "1px solid var(--line)" }} />)}
          </div>
        </details>
      ))}
    </div>
  );
}
