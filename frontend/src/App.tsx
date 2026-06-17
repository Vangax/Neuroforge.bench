import { useEffect, useState, useCallback } from "react";
import Boot from "./components/Boot";
import { api, getToken, setToken, type DatasetMeta } from "./api/client";
import { nowStamp } from "./lib/format";
import Repository from "./modules/repository/Repository";
import Visualize from "./modules/visualize/Visualize";
import Preprocess from "./modules/preprocess/Preprocess";
import ERP from "./modules/erp/ERP";
import Analyze from "./modules/analyze/Analyze";
import Mapper from "./modules/mapper/Mapper";
import Bench from "./modules/bench/Bench";
import BCI from "./modules/bci/BCI";
import Editor from "./modules/editor/Editor";
import Report from "./modules/report/Report";
import CodeLab from "./modules/lab/CodeLab";
import { MODULE_INFO } from "./modules/placeholder/ModulePlaceholder";
import SceneDecor from "./components/SceneDecor";

interface ModDef { id: string; idx: string; label: string; gly: string; live: boolean }

const MODULES: ModDef[] = [
  { id: "repository", idx: "01", label: "Repo", gly: "▤", live: true },
  { id: "visualize", idx: "02", label: "View", gly: "∿", live: true },
  { id: "preprocess", idx: "03", label: "Prep", gly: "⚙", live: true },
  { id: "erp", idx: "04", label: "ERP", gly: "Λ", live: true },
  { id: "analyze", idx: "05", label: "Analyze", gly: "∑", live: true },
  { id: "mapper", idx: "06", label: "Mapper", gly: "◎", live: true },
  { id: "bench", idx: "07", label: "Bench", gly: "▥", live: true },
  { id: "bci", idx: "08", label: "BCI", gly: "◈", live: true },
  { id: "editor", idx: "09", label: "Editor", gly: "✎", live: true },
  { id: "report", idx: "10", label: "Report", gly: "▣", live: true },
  { id: "lab", idx: "11", label: "Lab", gly: "⌨", live: true },
];

export default function App() {
  const [booted, setBooted] = useState(false);
  const [active, setActive] = useState("repository");
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clock, setClock] = useState(nowStamp());
  const [hasKey, setHasKey] = useState(getToken().length > 0);

  const setKey = () => {
    const t = window.prompt("API bearer token (blank to clear):", getToken());
    if (t !== null) { setToken(t.trim()); setHasKey(t.trim().length > 0); }
  };

  const refresh = useCallback(async () => {
    const { datasets } = await api.listDatasets();
    setDatasets(datasets);
    setSelectedId((cur) => cur && datasets.some((d) => d.id === cur) ? cur : datasets[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (booted) refresh();
  }, [booted, refresh]);

  useEffect(() => {
    const t = setInterval(() => setClock(nowStamp()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!booted) return <Boot onDone={() => setBooted(true)} />;

  const selected = datasets.find((d) => d.id === selectedId) ?? null;
  const activeMod = MODULES.find((m) => m.id === active)!;

  return (
    <div className="app">
      {/* ---- top bar ---- */}
      <header className="topbar">
        <div className="brand">
          <span className="mark">Neuroforge<sup>²</sup></span>
          <span className="sub">// desktop imperium</span>
        </div>

        <div className="row" style={{ marginLeft: 12, gap: 8 }}>
          <span className="tiny up dim">dataset</span>
          <select
            className="nf"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ minWidth: 230 }}
          >
            {datasets.length === 0 && <option>— none —</option>}
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
          <button className="btn sm" onClick={refresh} title="rescan repository">⟳</button>
        </div>

        <div className="topbar-right">
          <span className="led">
            <span className={`dot ${api.online ? "on" : "off"}`} />
            {api.source}
          </span>
          <span className="led"><span className="dot rec" />rec</span>
          <button className="led" onClick={setKey} title="set bearer token (for auth-enabled servers)"
            style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", letterSpacing: "inherit", textTransform: "uppercase" }}>
            <span className="dot" style={{ background: hasKey ? "var(--gold)" : "var(--txt-dim)", boxShadow: hasKey ? "0 0 8px var(--gold)" : "none" }} />
            {hasKey ? "auth✓" : "auth"}
          </button>
          <span className="clock">{clock}</span>
        </div>
      </header>

      {/* ---- body: rail + content ---- */}
      <div className="app-body">
        <nav className="rail">
          {MODULES.map((m) => (
            <button
              key={m.id}
              className={`rail-btn ${active === m.id ? "active" : ""}`}
              onClick={() => setActive(m.id)}
              title={`${m.idx} · ${MODULE_INFO[m.id]?.name ?? m.label}${m.live ? "" : " (roadmap)"}`}
            >
              <span className="gly">{m.gly}</span>
              <span className="lbl">{m.label}</span>
            </button>
          ))}
          <div className="rail-spacer" />
          <div className="rail-meta">v0.1<br />MVP</div>
        </nav>

        <main className="content">
          <SceneDecor />
          {active === "repository" && (
            <Repository
              datasets={datasets}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChanged={refresh}
              onOpenViewer={() => setActive("visualize")}
            />
          )}
          {active === "visualize" && <Visualize dataset={selected} />}
          {active === "preprocess" && <Preprocess dataset={selected} onChanged={refresh} />}
          {active === "erp" && <ERP dataset={selected} onChanged={refresh} />}
          {active === "analyze" && <Analyze dataset={selected} onChanged={refresh} />}
          {active === "mapper" && <Mapper dataset={selected} onChanged={refresh} />}
          {active === "bench" && <Bench dataset={selected} onChanged={refresh} />}
          {active === "bci" && <BCI dataset={selected} onChanged={refresh} />}
          {active === "editor" && <Editor dataset={selected} onChanged={refresh} />}
          {active === "report" && <Report dataset={selected} onChanged={refresh} />}
          {active === "lab" && <CodeLab dataset={selected} onChanged={refresh} />}
        </main>
      </div>

      {/* ---- status bar ---- */}
      <footer className="statusbar">
        <div className="status-cell amber">
          <span>module</span><span className="v">{activeMod.idx} · {MODULE_INFO[active]?.name ?? activeMod.label}</span>
        </div>
        <div className="status-cell">
          <span>source</span><span className="v">{api.source}</span>
        </div>
        {selected && (
          <>
            <div className="status-cell"><span>fs</span><span className="v">{selected.sfreq} Hz</span></div>
            <div className="status-cell"><span>ch</span><span className="v">{selected.n_channels}</span></div>
            <div className="status-cell"><span>dur</span><span className="v">{selected.duration.toFixed(1)} s</span></div>
            <div className="status-cell"><span>evt</span><span className="v">{selected.n_events}</span></div>
          </>
        )}
        <div className="status-cell grow">
          <span>NEUROFORGE // {datasets.length} datasets indexed · BIDS-native engine ready</span>
        </div>
      </footer>
    </div>
  );
}
