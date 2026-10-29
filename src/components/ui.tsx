// Small shared UI pieces in the original Pixel Studio style.
import type { ReactNode } from 'react';

/** Collapsible right-panel section with a title and a one-line explanation, as in the original. */
export function Section(props: { title: string; caption: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="ps-sec">
      <button className={'ps-sec-head' + (props.open ? ' open' : '')} onClick={props.onToggle} aria-expanded={props.open}>
        <div className="t"><b>{props.title}</b><span>{props.caption}</span></div>
        <div className="c">{props.open ? '−' : '+'}</div>
      </button>
      {props.open && <div className="ps-sec-body">{props.children}</div>}
    </div>
  );
}

/** Label row: name on the left, current value on the right. */
export function LabelRow({ label, value, variant, gold }: { label: string; value?: ReactNode; variant?: 'big' | 'small'; gold?: boolean }) {
  return <div className={'ps-lab' + (variant ? ' ' + variant : '')}><div>{label}</div>{value !== undefined && <div className={'v' + (gold ? ' gold' : '')}>{value}</div>}</div>;
}

export function Ends({ left, right }: { left: string; right: string }) { return <div className="ps-ends"><div>{left}</div><div>{right}</div></div>; }

export function Slider(props: { min: number; max: number; value: number; onChange: (v: number) => void; onPointerDown?: () => void; label?: string }) {
  return <input type="range" min={props.min} max={props.max} step={1} value={props.value} aria-label={props.label} onPointerDown={props.onPointerDown} onChange={e => props.onChange(+e.target.value)} />;
}

/** 8×8 pixel icon drawn as SVG rects ('X' = filled), crisp at any size. */
export function PixelIcon({ rows, color }: { rows: readonly string[]; color: string }) {
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((r, y) => [...r].map((ch, x) => (ch === 'X' ? <rect key={x + ',' + y} x={x} y={y} width={1} height={1} fill={color} /> : null)))}
    </svg>
  );
}
