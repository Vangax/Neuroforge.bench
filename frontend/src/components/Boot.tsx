import { useEffect, useState } from "react";
import { api, type Health } from "../api/client";
import HeroBurst from "./HeroBurst";

const LINES = [
  "initializing neuroforge kernel ........",
  "mounting BIDS-native repository ........",
  "loading MNE-Python signal core ........",
  "calibrating montage geometry [10-20/10-10/10-5] ....",
  "spinning up DSP units: welch · multitaper · morlet ....",
  "arming topographic interpolation grid ....",
  "linking visualization engine [webgl] ....",
  "probing backend // FastAPI ........",
];

export default function Boot({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  const [health, setHealth] = useState<Health | null | "pending">("pending");

  useEffect(() => { api.health().then(setHealth); }, []);
  useEffect(() => {
    if (n >= LINES.length) {
      const t = setTimeout(onDone, 750);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((x) => x + 1), 220 + Math.random() * 150);
    return () => clearTimeout(t);
  }, [n, onDone]);

  const pct = Math.round((n / LINES.length) * 100);

  return (
    <div className="boot">
      <div className="boot-stage">
        <HeroBurst animate floor seed={4} />
        <div className="boot-title">
          <div className="mark">Neuroforge<sup>²</sup></div>
          <div className="tag">desktop imperium · universal brain-data platform</div>
        </div>
      </div>
      <div className="boot-foot">
        <div className="row" style={{ justifyContent: "space-between", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>
          <span className="dim">boot sequence</span>
          <span className="gold">{pct}%</span>
        </div>
        <div className="boot-bar"><i style={{ ["--p" as string]: `${pct}%` }} /></div>
        <div className="boot-log">
          {LINES.slice(0, n).map((l, i) => (
            <div key={i} className="ln">
              <span className="dim">›</span> {l}{" "}
              {i === LINES.length - 1 ? (
                health === "pending" ? <span className="dim">…</span>
                  : health ? <span className="ok">[ONLINE · MNE {health.mne}]</span>
                    : <span className="crim">[OFFLINE · demo mode]</span>
              ) : <span className="ok">[OK]</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
