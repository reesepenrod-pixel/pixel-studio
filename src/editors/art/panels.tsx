// Right-panel sections of the Art workspace. Wording, order and behavior follow the original.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Ends, LabelRow, Section, Slider } from '../../components/ui';
import type { RangeInfo } from '../../core/imaging';
import type { ArtController, ArtState, SectionId } from './controller';
import type { LayerMeta } from './doc';

type P = { ctl: ArtController; s: ArtState };
const sec = (ctl: ArtController, s: ArtState, id: SectionId) => ({ open: s.secOpen[id], onToggle: () => ctl.toggleSection(id) });

function Swatches({ colors, current, onPick }: { colors: string[]; current: string; onPick: (c: string) => void }) {
  return (
    <div className="ps-swatches">
      {colors.map(c => <button key={c} className={'ps-swatch' + (c.toLowerCase() === current.toLowerCase() ? ' on' : '')} title={c} style={{ background: c }} onClick={() => onPick(c)} />)}
    </div>
  );
}

export function ColorPanel({ ctl, s }: P) {
  return (
    <Section title="COLOR & BRUSH" caption="WHAT THE PENCIL PAINTS · ALT+CLICK CANVAS TO PICK A COLOR" {...sec(ctl, s, 'color')}>
      <div className="ps-color">
        <label style={{ background: s.color }}><input type="color" value={s.color} onChange={e => ctl.setColor(e.target.value)} aria-label="Pencil color" /></label>
        <div className="ps-col" style={{ gap: 3 }}><div className="hex">{s.color.toUpperCase()}</div><div className="hint">CLICK SWATCH TO EDIT · ALT+CLICK CANVAS TO PICK</div></div>
      </div>
      {s.recent.length > 0 && <><div className="ps-cap">RECENT</div><Swatches colors={s.recent} current={s.color} onPick={c => ctl.setColor(c)} /></>}
      <div className="ps-cap">IN THE SCENE</div>
      <Swatches colors={s.palette} current={s.color} onPick={c => ctl.setColor(c)} />
      <div className="ps-col ps-divide">
        <LabelRow label="BRUSH SIZE" value={s.size + ' PX'} />
        <Slider min={1} max={8} value={s.size} onChange={v => ctl.setSize(v)} label="Brush size" />
        <div className="ps-note">[ AND ] TO RESIZE · PENCIL + ERASER</div>
      </div>
    </Section>
  );
}

export function SelectionPanel({ ctl, s }: P) {
  const op = s.selCount ? 1 : 0.45;
  return (
    <Section title="SELECTION" caption="PAINT OVER PIXELS, THEN CLIP OR COPY THEM TO A NEW LAYER" {...sec(ctl, s, 'clip')}>
      <div className="ps-col8">
        <LabelRow variant="big" label="SELECTION BRUSH" value={s.selSize + ' PX'} />
        <Slider min={1} max={24} value={s.selSize} onChange={v => ctl.setSelSize(v)} label="Selection brush size" />
        <div className="ps-note n9">PAINT OVER PIXELS ON THE ACTIVE LAYER, THEN CLIP THEM INTO THEIR OWN LAYER.</div>
      </div>
      <div className="ps-col">
        <LabelRow variant="big" label="SELECTION" value={s.selCount ? s.selCount + ' PX' : 'NONE'} gold />
        <button className="ps-btn gold" style={{ opacity: op }} onClick={() => ctl.clipOut(true)}>CLIP TO NEW LAYER</button>
        <button className="ps-btn plain" style={{ opacity: op }} onClick={() => ctl.clipOut(false)}>COPY TO NEW LAYER</button>
        <div className="ps-grid3">
          <button className="ps-btn s9p7" title="Select every pixel on the active layer" onClick={() => ctl.selectLayerPixels()}>LAYER</button>
          <button className="ps-btn s9p7" onClick={() => ctl.invertSelection()}>INVERT</button>
          <button className="ps-btn s9p7" onClick={() => ctl.clearSelection()}>CLEAR</button>
        </div>
      </div>
    </Section>
  );
}

/** Layer thumbnail: the canvas-area pixels, drawn whenever that layer changes. */
function Thumb({ ctl, id, rev, faded }: { ctl: ArtController; id: number; rev: number; faded: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || !ctl.doc.pix.has(id)) return;
    const r = ctl.doc.canvasPixels(id);
    c.getContext('2d')!.putImageData(new ImageData(r.data.slice(), r.w, r.h), 0, 0);
  }, [ctl, id, rev]);
  return <canvas ref={ref} className="ps-thumb" width={ctl.doc.w} height={ctl.doc.h} style={{ opacity: faded ? 0.35 : 1 }} />;
}

function LayerRow({ ctl, l, active, rev }: { ctl: ArtController; l: LayerMeta; active: boolean; rev: number }) {
  const [editing, setEditing] = useState(false);
  const fg = active ? '#f2ecd8' : l.visible ? '#bbb' : '#666';
  return (
    <div className={'ps-layer' + (active ? ' on' : '')} title="Double-click to rename" onClick={() => ctl.selectLayer(l.id)} onDoubleClick={() => setEditing(true)}>
      <button className="ps-eye" aria-label="Toggle visibility" style={{ color: l.visible ? '#f2ecd8' : '#666' }} onClick={e => { e.stopPropagation(); ctl.toggleVisible(l.id); }}>{l.visible ? 'ON' : 'OFF'}</button>
      <Thumb ctl={ctl} id={l.id} rev={rev} faded={!l.visible} />
      <div className="ps-lname" style={{ color: fg }}>
        {editing
          ? <input autoFocus defaultValue={l.name} maxLength={24} aria-label="Layer name" onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') { ctl.renameLayer(l.id, e.currentTarget.value); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
              onBlur={e => { ctl.renameLayer(l.id, e.currentTarget.value); setEditing(false); }} />
          : l.name}
      </div>
    </div>
  );
}

export function LayersPanel({ ctl, s }: P) {
  const a = s.layers.find(l => l.id === s.active), op = a ? a.opacity : 100;
  return (
    <Section title="LAYERS" caption="ORDER, VISIBILITY AND OPACITY OF EACH LAYER" {...sec(ctl, s, 'layers')}>
      <button className="ps-btn" onClick={ctl.newLayer}>+ NEW LAYER</button>
      <div className="ps-layers">
        {s.layers.slice().reverse().map(l => <LayerRow key={l.id} ctl={ctl} l={l} active={l.id === s.active} rev={s.layerRev[l.id] || 0} />)}
      </div>
      <div className="ps-col" style={{ paddingTop: 4 }}>
        <LabelRow label="LAYER OPACITY" value={op + '%'} />
        <Slider min={0} max={100} value={op} onPointerDown={() => ctl.opacityStart()} onChange={v => ctl.setOpacity(v)} label="Layer opacity" />
      </div>
      <div className="ps-grid4">
        <button className="ps-btn s9" onClick={() => ctl.moveLayer(1)}>UP</button>
        <button className="ps-btn s9" onClick={() => ctl.moveLayer(-1)}>DOWN</button>
        <button className="ps-btn s9" title="Merge into layer below" onClick={ctl.mergeDown}>MERGE</button>
        <button className="ps-btn s9 danger" onClick={ctl.deleteLayer}>DEL</button>
      </div>
      <div className="ps-note" style={{ color: '#555' }}>DOUBLE-CLICK A LAYER TO RENAME</div>
    </Section>
  );
}

export function ImportPanel({ ctl, s }: P) {
  const file = useRef<HTMLInputElement>(null), png = useRef<HTMLInputElement>(null);
  return (
    <Section title="IMPORT" caption="BRING AN IMAGE IN AS A NEW LAYER — PIXELATED OR EXACT" {...sec(ctl, s, 'import')}>
      <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,.png,.jpg,.jpeg,.gif,.webp,.bmp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ctl.importFile(f); }} />
      <input ref={png} type="file" hidden accept="image/png,.png" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void ctl.importExact(f); }} />
      <button className="ps-btn cream" onClick={() => file.current?.click()}>IMPORT &amp; PIXELATE…</button>
      <button className="ps-btn gold" title="Places the PNG pixel-for-pixel: no resizing, no palette change, transparency kept" onClick={() => png.current?.click()}>IMPORT PNG (EXACT)…</button>
      <button className="ps-btn p7" onClick={() => void ctl.addScene(true)}>ADD DOCK SCENE LAYERS</button>
      <div className="ps-col ps-divide">
        <div className="ps-cap c7">BEFORE PIXELATING</div>
        <button className="ps-toggle" title="Makes a solid background color touching the image edges transparent" onClick={() => ctl.toggleRmBg()}><span>REMOVE SOLID BACKGROUND</span><span className={s.rmBg ? 'on' : 'off'}>{s.rmBg ? 'ON' : 'OFF'}</span></button>
        <button className="ps-toggle" title="Crops empty transparent space around the image before fitting it to the grid" onClick={() => ctl.toggleTrim()}><span>TRIM TRANSPARENT EDGES</span><span className={s.trim ? 'on' : 'off'}>{s.trim ? 'ON' : 'OFF'}</span></button>
      </div>
    </Section>
  );
}

function ToneButton({ r, cls, title, onClick }: { r: RangeInfo; cls: string; title: string; onClick: (e: ReactMouseEvent) => void }) {
  return <button className={'ps-tone' + cls} title={title} onClick={onClick}>{r.tones.map((c, i) => <div key={i} style={{ background: c }} />)}</button>;
}

export function TuningPanel({ ctl, s }: P) {
  const t = s.sliders, info = s.info, a = s.layers.find(l => l.id === s.active), ranges = info?.ranges ?? [];
  const tones = Math.round(Math.pow(64, t.family / 100));
  return (
    <Section title="IMAGE TUNING" caption="SIMPLIFY PALETTE, SHARPEN AND SHAPE SHADOWS ON IMPORTS OR THE ACTIVE LAYER" {...sec(ctl, s, 'tune')}>
      <LabelRow label="PALETTE COMPLEXITY" value={info ? info.k + ' / ' + info.uniq + ' COLORS' : t.detail === 100 ? 'ALL COLORS' : t.detail + '%'} />
      <Slider min={0} max={100} value={t.detail} onChange={v => ctl.setSlider('detail', v)} label="Palette complexity" />
      <Ends left="SIMPLE" right="ORIGINAL" />
      <LabelRow label="PALETTE COMPLEXITY 2" value={t.family >= 100 ? 'OFF' : (info?.family ? info.family.fams + ' RANGES · ' : '') + Math.max(1, tones) + ' TONE' + (tones > 1 ? 'S' : '') + ' EACH'} />
      <Slider min={0} max={100} value={t.family} onChange={v => ctl.setSlider('family', v)} label="Palette complexity 2" />
      <Ends left="FLAT" right="ORIGINAL" />
      <div className="ps-col8" style={{ opacity: t.family < 100 ? 1 : 0.4 }}>
        <LabelRow label="RANGE SEPARATION" value={info?.family ? info.family.fams + ' RANGES' : t.separation + '%'} />
        <Slider min={0} max={100} value={t.separation} onChange={v => ctl.setSlider('separation', v)} label="Range separation" />
        <Ends left="FEWER" right="MORE RANGES" />
      </div>
      <LabelRow label="SHARPNESS" value={t.sharp ? t.sharp + '%' : 'OFF'} />
      <Slider min={0} max={100} value={t.sharp} onChange={v => ctl.setSlider('sharp', v)} label="Sharpness" />
      <Ends left="SOFT" right="CRISP" />
      <div className="ps-col8" style={{ opacity: t.sharp ? 1 : 0.4 }}>
        <LabelRow label="TAME HIGHLIGHTS" value={t.tame + '%'} />
        <Slider min={0} max={100} value={t.tame} onChange={v => ctl.setSlider('tame', v)} label="Tame highlights" />
        <Ends left="HARSH" right="NO HALOS" />
      </div>
      <LabelRow label="DEEPEN SHADOWS" value={t.deep ? t.deep + '%' : 'OFF'} />
      <Slider min={0} max={100} value={t.deep} onChange={v => ctl.setSlider('deep', v)} label="Deepen shadows" />
      <Ends left="OFF" right="DEEP" />
      <div className="ps-col" style={{ opacity: t.deep ? 1 : 0.45 }}>
        <LabelRow variant="small" label="DARKEN WHICH RANGES" value={!t.deepSel ? 'ALL RANGES' : t.deepSel.length + ' SELECTED'} />
        <div className="ps-tones">
          <button className={'ps-tone-all' + (t.deepSel ? '' : ' on')} onClick={() => ctl.deepAll()}>ALL</button>
          {ranges.slice(0, 24).map(r => <ToneButton key={r.ri} r={r} cls={t.deepSel?.includes(r.ri) ? ' on' : ''} title={r.count + ' tones · ' + r.n + ' px'} onClick={() => ctl.toggleDeepRange(r.ri)} />)}
        </div>
        {!ranges.length && <div className="ps-note dim">RANGES APPEAR WHILE ADJUSTING AN IMPORT · DARK → LIGHT</div>}
      </div>
      <div className="ps-note n9">{info ? 'ADJUSTING: ' + info.name.toUpperCase() + ' · EDITS BAKE IN, SLIDERS STILL WORK AFTER' : a ? 'SLIDERS ADJUST ' + a.name.toUpperCase() + ' · OR IMPORT / DROP A NEW IMAGE' : 'APPLIES TO NEXT IMPORT · OR DROP AN IMAGE ON THE CANVAS'}</div>
      {!info && a && <button className="ps-btn p7" title="Re-run the import tools on this layer's current pixels" onClick={ctl.adjustLayer}>{'ADJUST ' + a.name.toUpperCase()}</button>}
    </Section>
  );
}

const HUE_SECTORS: [number, string][] = [[45, 'REDS'], [80, 'ORANGES & BROWNS'], [115, 'YELLOWS'], [170, 'GREENS'], [230, 'TEALS'], [290, 'BLUES'], [345, 'PURPLES'], [361, 'REDS']];
const GROUP_ORDER = ['NEUTRALS', 'REDS', 'ORANGES & BROWNS', 'YELLOWS', 'GREENS', 'TEALS', 'BLUES', 'PURPLES'];

export function RecolorPanel({ ctl, s }: P) {
  const t = s.sliders, adj = t.rangeAdj, sel = t.editRi || [], A = adj[sel[0]] || {}, sg = (v?: number) => (v && v > 0 ? '+' : '') + (v || 0);
  const groups = new Map<string, RangeInfo[]>();
  for (const r of (s.info?.ranges ?? []).slice(0, 32)) {
    const g = r.avg.C < 0.035 ? 'NEUTRALS' : HUE_SECTORS.find(x => r.avg.h < x[0])![1];
    if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(r);
  }
  return (
    <Section title="RECOLOR RANGES" caption="SHIFT HUE, BRIGHTNESS OR SATURATION OF WHOLE COLOR FAMILIES" {...sec(ctl, s, 'ranges')}>
      <div className="ps-col">
        <div className="ps-lab"><div>SHIFT-CLICK TO PICK SEVERAL</div><button className="ps-link" onClick={() => ctl.resetRanges(true)}>RESET ALL</button></div>
        <div className="ps-note" style={{ color: '#f2ecd8', letterSpacing: '0.1em' }}>{sel.length > 1 ? sel.length + ' RANGES SELECTED' : sel.length ? '1 RANGE SELECTED' : 'SHIFT-CLICK FOR MULTIPLE'}</div>
        {GROUP_ORDER.filter(g => groups.has(g)).map(g => {
          const rs = groups.get(g)!.sort((a, b) => a.avg.L - b.avg.L), ids = rs.map(r => r.ri);
          return (
            <div key={g} className="ps-col" style={{ gap: 5 }}>
              <button className="ps-link" title="Select every range in this group (shift adds)" onClick={e => ctl.pickRangeGroup(ids, e.shiftKey)}>{g + ' · ' + rs.length}</button>
              <div className="ps-tones">
                {rs.map(r => { const R = adj[r.ri], mod = R && (R.h || R.b || R.s); return <ToneButton key={r.ri} r={r} cls={sel.includes(r.ri) ? ' edit' : mod ? ' mod' : ''} title={r.count + ' tones · ' + r.n + ' px · shift-click to multi-select'} onClick={e => ctl.pickRange(r.ri, e.shiftKey)} />; })}
              </div>
            </div>
          );
        })}
        {!s.info?.ranges.length && <div className="ps-note dim">PICK A RANGE WHILE ADJUSTING AN IMPORT OR LAYER</div>}
        {sel.length > 0 && !!s.info && (
          <div className="ps-col">
            <LabelRow label="HUE" value={sg(A.h) + '°'} />
            <Slider min={-180} max={180} value={A.h || 0} onChange={v => ctl.setRangeAdjust('h', v)} label="Hue" />
            <LabelRow label="BRIGHTNESS" value={sg(A.b)} />
            <Slider min={-100} max={100} value={A.b || 0} onChange={v => ctl.setRangeAdjust('b', v)} label="Brightness" />
            <LabelRow label="SATURATION" value={sg(A.s)} />
            <Slider min={-100} max={100} value={A.s || 0} onChange={v => ctl.setRangeAdjust('s', v)} label="Saturation" />
            <button className="ps-toggle" style={{ justifyContent: 'center', padding: 6 }} onClick={() => ctl.resetRanges(false)}>{sel.length > 1 ? 'RESET SELECTED' : 'RESET THIS RANGE'}</button>
          </div>
        )}
      </div>
    </Section>
  );
}

export function ExportPanel({ ctl, s }: P) {
  return (
    <Section title="EXPORT PNG" caption="SAVE THE FULL IMAGE OR THE ACTIVE LAYER" {...sec(ctl, s, 'export')}>
      <div className="ps-grid4">
        {[1, 2, 4, 8].map(v => <button key={v} className={'ps-btn s9' + (s.expScale === v ? ' on' : '')} onClick={() => ctl.setExportScale(v)}>{v}×</button>)}
      </div>
      <div className="ps-note n9" style={{ letterSpacing: '0.04em' }}>{s.w * s.expScale + ' × ' + s.h * s.expScale + ' PX'}</div>
      <div className="ps-grid2">
        <button className="ps-btn gold small" onClick={() => ctl.exportPng(false)}>IMAGE</button>
        <button className="ps-btn" style={{ padding: '8px 0' }} onClick={() => ctl.exportPng(true)}>ACTIVE LAYER</button>
      </div>
    </Section>
  );
}
