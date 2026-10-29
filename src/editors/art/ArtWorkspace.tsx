// The Art workspace: top bar, tool rail, canvas, status bar and properties panel,
// laid out exactly like the original Pixel Studio.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PixelIcon } from '../../components/ui';
import { ArtController, MOVE_HINT, TOOLS } from './controller';
import { ICONS } from './icons';
import { ColorPanel, ExportPanel, ImportPanel, LayersPanel, RecolorPanel, SelectionPanel, TuningPanel } from './panels';
import './art.css';

export function ArtWorkspace({ controller }: { controller?: ArtController }) {
  const [ctl] = useState(() => controller ?? new ArtController());
  const s = useSyncExternalStore(ctl.subscribe, ctl.getState);
  const scroll = useRef<HTMLDivElement>(null), main = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLCanvasElement>(null), cursor = useRef<HTMLCanvasElement>(null);

  useEffect(() => { void ctl.init(); }, [ctl]);
  useEffect(() => ctl.attach({ scroll: scroll.current!, main: main.current!, overlay: overlay.current!, cursor: cursor.current! }), [ctl]);
  // Changing zoom resizes (and so clears) the overlay canvases; redraw them after React commits.
  useLayoutEffect(() => { ctl.afterRender(); }, [ctl, s.zoom, s.grid, s.view, s.tool, s.active, s.rev]);
  // Unsaved work is flushed if the page is closed mid-debounce.
  useEffect(() => { const f = () => { void ctl.saveNow(); }; window.addEventListener('pagehide', f); return () => window.removeEventListener('pagehide', f); }, [ctl]);

  const a = s.layers.find(l => l.id === s.active), z = s.zoom;
  const status = s.status || (s.tool === 'move' ? MOVE_HINT : a ? 'ACTIVE: ' + a.name.toUpperCase() + (a.visible ? '' : ' (HIDDEN)') : '');
  const save = s.save.state === 'error' ? 'NOT SAVED: ' + s.save.message : s.save.state === 'saving' ? 'SAVING…' : s.save.state === 'saved' ? 'SAVED' : '';

  return (
    <div className="ps-root" data-screen-label="Pixel Studio">
      <div className="ps-top">
        <div className="ps-brand"><b>PIXEL STUDIO</b><span>{s.w} × {s.h}</span></div>
        <div className="ps-group">
          {(['paint', 'clip'] as const).map(v => <button key={v} className={'ps-tb view' + (s.view === v ? ' on' : '')} onClick={() => ctl.setView(v)}>{v.toUpperCase()}</button>)}
        </div>
        <div className="ps-spacer" />
        <div className="ps-group">
          <button className={'ps-tb' + (s.canUndo ? '' : ' dim')} title="Undo (Ctrl+Z)" onClick={ctl.undo}>UNDO</button>
          <button className={'ps-tb' + (s.canRedo ? '' : ' dim')} title="Redo (Ctrl+Shift+Z)" onClick={ctl.redo}>REDO</button>
        </div>
        <div className="ps-group">
          <button className="ps-tb sq" aria-label="Zoom out" onClick={() => ctl.setZoom(z - 1)}>−</button>
          <div className="ps-zoom">{z}×</div>
          <button className="ps-tb sq" aria-label="Zoom in" onClick={() => ctl.setZoom(z + 1)}>+</button>
          <button className={'ps-tb' + (s.grid ? ' on' : '')} onClick={() => ctl.toggleGrid()}>GRID</button>
        </div>
      </div>
      <div className="ps-main">
        <div className="ps-rail">
          {TOOLS[s.view].map(([id, label, key]) => {
            const on = s.tool === id;
            return <button key={id} className={'ps-tool' + (on ? ' on' : '')} title={label + ' (' + key + ')'} onClick={() => ctl.setTool(id)}><PixelIcon rows={ICONS[id]} color={on ? '#1a1410' : '#cfcfcf'} /><div>{label}</div></button>;
          })}
        </div>
        <div className="ps-center">
          <div ref={scroll} className="ps-scroll"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) void ctl.importFile(f); }}
            onPointerDown={ctl.onPointerDown} onPointerMove={ctl.onPointerMove} onPointerUp={ctl.onPointerUp} onPointerCancel={ctl.onPointerUp}
            onPointerLeave={ctl.onPointerLeave} onContextMenu={e => e.preventDefault()}>
            <div className="ps-pad">
              <div className="ps-stage" style={{ width: s.w * z, height: s.h * z, backgroundSize: z * 2 + 'px ' + z * 2 + 'px' }}>
                <canvas ref={main} className="main" width={s.w} height={s.h} />
                <canvas ref={overlay} className="overlay" width={s.w * z} height={s.h * z} />
                <canvas ref={cursor} className="cursor" width={s.w * z} height={s.h * z} style={{ cursor: s.cursorCss }} />
              </div>
            </div>
          </div>
          <div className="ps-status">
            <div>{s.cursor ? 'X ' + s.cursor.x + '  Y ' + s.cursor.y : 'X –  Y –'}</div>
            <div className={'ps-save ' + s.save.state} role="status">{save}</div>
            <div className="ps-spacer" />
            <div className={s.status ? 'flash' : 'idle'}>{status}</div>
          </div>
        </div>
        <div className="ps-panel">
          {s.view === 'paint' && <ColorPanel ctl={ctl} s={s} />}
          {s.view === 'clip' && <SelectionPanel ctl={ctl} s={s} />}
          <LayersPanel ctl={ctl} s={s} />
          {s.view === 'paint' && <><ImportPanel ctl={ctl} s={s} /><TuningPanel ctl={ctl} s={s} /><RecolorPanel ctl={ctl} s={s} /></>}
          <ExportPanel ctl={ctl} s={s} />
        </div>
      </div>
    </div>
  );
}
