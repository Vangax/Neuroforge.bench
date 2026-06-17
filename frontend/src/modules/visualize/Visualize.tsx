import { useEffect, useRef, useState } from "react";
import { Panel, Spinner } from "../../components/hud";
import {
  api, type DatasetMeta, type WindowData, type PSDData, type TopomapData, type BandPowerData,
} from "../../api/client";
import SignalViewer from "./SignalViewer";
import PSDPanel from "./PSDPanel";
import Topomap from "./Topomap";
import BandPower from "./BandPower";
import Brain3D from "./Brain3D";

const BANDS: Record<string, [number, number]> = {
  delta: [0.5, 4], theta: [4, 8], alpha: [8, 13], beta: [13, 30], gamma: [30, 45],
};

export default function Visualize({ dataset }: { dataset: DatasetMeta | null }) {
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(10);
  const [gain, setGain] = useState(60); // µV per trace lane
  const [band, setBand] = useState<string>("alpha");
  const [playing, setPlaying] = useState(false);

  const [win, setWin] = useState<WindowData | null>(null);
  const [psd, setPsd] = useState<PSDData | null>(null);
  const [topo, setTopo] = useState<TopomapData | null>(null);
  const [bp, setBp] = useState<BandPowerData | null>(null);

  const id = dataset?.id ?? null;
  const total = dataset?.duration ?? 0;
  const maxStart = Math.max(0, total - duration);

  // reset + dataset-level fetches
  useEffect(() => {
    if (!id) return;
    setStart(0);
    setPsd(null); setBp(null);
    api.psd(id, 0.5, 45).then(setPsd);
    api.bandpower(id, false).then(setBp);
  }, [id]);

  // topomap depends on selected band
  useEffect(() => {
    if (!id) return;
    const [lo, hi] = BANDS[band];
    api.topomap(id, lo, hi, 48).then(setTopo);
  }, [id, band]);

  // window depends on start/duration
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.window(id, start, duration).then((w) => { if (alive) setWin(w); });
    return () => { alive = false; };
  }, [id, start, duration]);

  // real-time scroll playback
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !id) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setStart((s) => (s + dt >= maxStart ? 0 : s + dt));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, id, maxStart]);

  if (!dataset) {
    return (
      <div className="center" style={{ height: "60vh" }}>
        <Panel tag="VIEW" title="visualization engine">
          <div className="placeholder-note" style={{ padding: 8 }}>
            No dataset selected. Open <span className="amber">Module 01 · Repo</span> and pick a run.
          </div>
        </Panel>
      </div>
    );
  }

  const [lo, hi] = BANDS[band];

  return (
    <div className="col" style={{ gap: 12 }}>
      {/* ---- control strip ---- */}
      <Panel tag="CTRL" title="signal control" meta={`${dataset.label}`}>
        <div className="row wrap" style={{ gap: 18, alignItems: "flex-end" }}>
          <button className={`btn ${playing ? "amber" : ""}`} onClick={() => setPlaying((p) => !p)} style={{ minWidth: 92 }}>
            {playing ? "❚❚ pause" : "▶ stream"}
          </button>

          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>epoch start · {start.toFixed(1)}s / {total.toFixed(0)}s</label>
            <input className="nf" type="range" min={0} max={maxStart} step={0.1}
              value={Math.min(start, maxStart)} onChange={(e) => setStart(+e.target.value)} />
          </div>

          <div className="field">
            <label>window</label>
            <select className="nf" value={duration} onChange={(e) => setDuration(+e.target.value)}>
              {[5, 10, 20, 30].map((d) => <option key={d} value={d}>{d} s</option>)}
            </select>
          </div>

          <div className="field" style={{ minWidth: 150 }}>
            <label>scale · {gain} µV</label>
            <input className="nf" type="range" min={10} max={200} step={5}
              value={gain} onChange={(e) => setGain(+e.target.value)} />
          </div>

          <div className="field">
            <label>topo band</label>
            <select className="nf" value={band} onChange={(e) => setBand(e.target.value)}>
              {Object.keys(BANDS).map((b) => (
                <option key={b} value={b}>{b} ({BANDS[b][0]}–{BANDS[b][1]} Hz)</option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      {/* ---- signal viewer ---- */}
      <Panel tag="TIME" title="multichannel signal" meta={win ? `${win.ch_names.length} ch · decim ×${win.decimation} · ${win.units}` : ""} bodyClass="tight">
        {win ? <SignalViewer data={win} gain={gain} /> : <Spinner label="streaming window" />}
      </Panel>

      {/* ---- spectral row ---- */}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.3fr) 300px 300px" }}>
        <Panel tag="PSD" title="power spectral density" meta={psd ? `${psd.method} · ${psd.units}` : ""} bodyClass="tight">
          {psd ? <PSDPanel data={psd} bands={BANDS} highlight={band} /> : <Spinner label="welch" />}
        </Panel>

        <Panel tag="TOPO" title={`scalp · ${band}`} meta={`${lo}–${hi} Hz`} bodyClass="tight">
          {topo ? <Topomap data={topo} /> : <Spinner label="interpolating" />}
        </Panel>

        <Panel tag="3D" title="head model" meta="webgl">
          {bp ? <Brain3D bandpower={bp} band={band} /> : <Spinner label="building mesh" />}
        </Panel>
      </div>

      {/* ---- band power ---- */}
      <Panel tag="BAND" title="band power topograph" meta={bp ? `${bp.ch_names.length} channels` : ""} bodyClass="tight">
        {bp ? <BandPower data={bp} highlight={band} /> : <Spinner label="integrating psd" />}
      </Panel>
    </div>
  );
}
