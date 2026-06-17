import type { CSSProperties, ReactNode } from "react";

/** Bracket-framed HUD panel (the recurring motif from the references). */
export function Panel(props: {
  title?: ReactNode; tag?: string; meta?: ReactNode;
  children: ReactNode; className?: string; bodyClass?: string; style?: CSSProperties;
}) {
  return (
    <div className={`panel ${props.className ?? ""}`} style={props.style}>
      <span className="corner-tr" />
      <span className="corner-br" />
      {props.title !== undefined && (
        <div className="panel-head">
          {props.tag && <span className="tag">{props.tag}</span>}
          <span>{props.title}</span>
          <span className="spacer" />
          {props.meta !== undefined && <span className="meta">{props.meta}</span>}
        </div>
      )}
      <div className={`panel-body ${props.bodyClass ?? ""}`}>{props.children}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center col" style={{ gap: 12, padding: 24 }}>
      <div className="spinner" />
      {label && <span className="tiny up dim">{label}</span>}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode, boolean?][] }) {
  return (
    <div className="kv">
      {items.map(([k, v, hl], i) => (
        <div key={i} style={{ display: "contents" }}>
          <span className="k">{k}</span>
          <span className={`v ${hl ? "hl" : ""}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function Chip({ children, kind }: { children: ReactNode; kind?: "ok" | "plan" }) {
  return <span className={`chip ${kind ?? ""}`}>{children}</span>;
}
