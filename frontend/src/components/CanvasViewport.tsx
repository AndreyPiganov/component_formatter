import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { Artboard } from '../model/svg';

const minZoom = .25;
const maxZoom = 4;

export function CanvasViewport({ artboard, children }: { artboard: Artboard; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const currentZoom = useRef(1);
  const anchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);

  const zoomBy = useCallback((factor: number, pointer?: { clientX: number; clientY: number }) => {
    if (!viewport.current || !sheet.current) return;
    const next = Math.max(minZoom, Math.min(maxZoom, currentZoom.current * factor));
    if (next === currentZoom.current) return;
    const bounds = viewport.current.getBoundingClientRect();
    const board = sheet.current.getBoundingClientRect();
    const clientX = pointer?.clientX ?? bounds.left + viewport.current.clientWidth / 2;
    const clientY = pointer?.clientY ?? bounds.top + viewport.current.clientHeight / 2;
    anchor.current = { x: (clientX - board.left) / board.width, y: (clientY - board.top) / board.height, clientX, clientY };
    currentZoom.current = next;
    setZoom(next);
  }, []);

  useLayoutEffect(() => {
    const point = anchor.current;
    if (!point || !sheet.current || !viewport.current) return;
    const board = sheet.current.getBoundingClientRect();
    viewport.current.scrollLeft += board.left + board.width * point.x - point.clientX;
    viewport.current.scrollTop += board.top + board.height * point.y - point.clientY;
    anchor.current = null;
  }, [zoom]);

  useEffect(() => {
    const area = viewport.current;
    if (!area) return;
    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area!.clientHeight : 1;
      zoomBy(Math.exp(-event.deltaY * unit * .002), event);
    }
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  function fit() {
    currentZoom.current = 1;
    anchor.current = null;
    setZoom(1);
  }

  return <div className="canvas-space">
    <div className="canvas-viewport" ref={viewport} onKeyDown={(event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === '+' || event.key === '=') zoomBy(1.25);
      else if (event.key === '-') zoomBy(1 / 1.25);
      else if (event.key === '0') fit();
      else return;
      event.preventDefault();
    }}>
      <div className="canvas-mat">
        <div ref={sheet} className="artboard" style={{
          width: 'min(calc((100cqw - 24px) * ' + zoom + '), calc((100cqh - 24px) * ' +
            (zoom * artboard.width / artboard.height) + '))',
          aspectRatio: artboard.width + ' / ' + artboard.height,
          backgroundColor: artboard.background,
        }}>{children}</div>
      </div>
    </div>
    <div className="canvas-controls">
      <span className="canvas-size">{artboard.width} × {artboard.height} px</span>
      <div role="group" aria-label="Масштаб просмотра" title="Масштаб просмотра · Ctrl + колесо">
        <button className="icon-button" aria-label="Уменьшить холст" onClick={() => zoomBy(1 / 1.25)}
          disabled={zoom <= minZoom}><Minus size={15} /></button>
        <output aria-label="Масштаб холста">{Math.round(zoom * 100)}%</output>
        <button className="icon-button" aria-label="Увеличить холст" onClick={() => zoomBy(1.25)}
          disabled={zoom >= maxZoom}><Plus size={15} /></button>
        <button className="icon-button" title="Вписать холст" aria-label="Вписать холст" onClick={fit}>
          <Maximize size={15} />
        </button>
      </div>
    </div>
  </div>;
}
