import { memo, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CanvasViewport } from './CanvasViewport';
import { Layers } from 'lucide-react';
import { layerTransform, renderAsset, type Artboard, type Layer, type SvgAsset } from './svg';

interface CanvasProps {
  artboard: Artboard;
  layers: Layer[];
  assets: ReadonlyMap<string, SvgAsset>;
  palettes: ReadonlyMap<string, ReadonlyMap<string, string>>;
  selectedIds: string[];
  select: (ids: string[]) => void;
  move: (ids: string[], anchor: string, x: number, y: number) => void;
  rotate: (id: string, angle: number) => void;
  resize: (id: string, scale: number, pivot: Point) => void;
  remove: (id: string) => void;
}

interface Point { x: number; y: number }
type Gesture = { id: string; pointerId: number } & (
  | { kind: 'move'; ids: string[]; offset: Point }
  | { kind: 'rotate'; center: Point; initialAngle: number; startDirection: number | null }
  | { kind: 'resize'; pivot: Point; diagonal: Point; initialScale: number }
);

const emptyPalette = new Map<string, string>();
const VectorObject = memo(function VectorObject({ asset, id, palette, colorSlots }: {
  asset: SvgAsset; id: string; palette: ReadonlyMap<string, string>; colorSlots?: Layer['colorSlots'];
}) {
  const markup = useMemo(() => renderAsset(asset, 'preview-' + id, palette, colorSlots), [asset, id, palette, colorSlots]);
  return <g aria-hidden="true" pointerEvents="none" dangerouslySetInnerHTML={{ __html: markup }} />;
});

export function Canvas({ artboard, layers, assets, palettes, selectedIds, select, move, rotate, resize, remove }: CanvasProps) {
  const canvas = useRef<SVGSVGElement>(null);
  const drag = useRef<Gesture | null>(null);
  const boxStart = useRef<{ pointerId: number; point: Point } | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const selected = layers.find((layer) => selectedIds.length === 1 && layer.id === selectedIds[0]);
  const asset = selected && assets.get(selected.assetId);
  const halfWidth = selected && asset ? selected.scale * asset.width / 2 : 0;
  const halfHeight = selected && asset ? selected.scale * asset.height / 2 : 0;
  const [pixel, setPixel] = useState(1);
  useLayoutEffect(() => {
    const svg = canvas.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setPixel(artboard.width / width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [artboard.width]);

  function pointerPosition(event: PointerEvent<SVGElement>) {
    const matrix = canvas.current?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }

  function start(event: PointerEvent<SVGElement>, layer: Layer, kind: Gesture['kind']) {
    if (event.button !== 0 || drag.current || boxStart.current) return;
    const point = pointerPosition(event);
    if (!point || !canvas.current) return;
    event.stopPropagation();
    event.preventDefault();
    canvas.current.focus({ preventScroll: true });
    if (event.shiftKey && kind === 'move') {
      select(selectedIds.includes(layer.id) ? selectedIds.filter((id) => id !== layer.id) : [...selectedIds, layer.id]);
      return;
    }
    canvas.current.setPointerCapture(event.pointerId);
    const ids = kind === 'move' && selectedIds.includes(layer.id) ? selectedIds : [layer.id];
    const pointer = { id: layer.id, pointerId: event.pointerId };
    const offset = { x: point.x - layer.x, y: point.y - layer.y };
    if (kind === 'rotate') {
      drag.current = { ...pointer, kind, center: { x: layer.x, y: layer.y }, initialAngle: layer.rotation,
        startDirection: Math.hypot(offset.x, offset.y) > pixel ? Math.atan2(offset.y, offset.x) : null };
    } else if (kind === 'resize') {
      // Keep the diagonally opposite corner fixed, even when the object is rotated.
      const radians = layer.rotation * Math.PI / 180;
      const pivot = {
        x: layer.x - halfWidth * Math.cos(radians) + halfHeight * Math.sin(radians),
        y: layer.y - halfWidth * Math.sin(radians) - halfHeight * Math.cos(radians),
      };
      drag.current = { ...pointer, kind, pivot, initialScale: layer.scale,
        diagonal: { x: point.x - pivot.x, y: point.y - pivot.y } };
    } else {
      drag.current = { ...pointer, kind, ids, offset };
    }
    select(ids);
  }

  function beginBox(event: PointerEvent<SVGSVGElement>) {
    const point = pointerPosition(event);
    if (event.button !== 0 || drag.current || boxStart.current || !point) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    boxStart.current = { pointerId: event.pointerId, point };
    select([]);
  }

  function boxAt(event: PointerEvent<SVGSVGElement>) {
    const origin = boxStart.current;
    const point = pointerPosition(event);
    if (!origin || origin.pointerId !== event.pointerId || !point) return null;
    return { x: Math.min(origin.point.x, point.x), y: Math.min(origin.point.y, point.y),
      width: Math.abs(point.x - origin.point.x), height: Math.abs(point.y - origin.point.y) };
  }

  function update(event: PointerEvent<SVGSVGElement>) {
    if (boxStart.current?.pointerId === event.pointerId) {
      setBox(boxAt(event));
      return;
    }
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = pointerPosition(event);
    if (!point) return;
    if (active.kind === 'move') {
      move(active.ids, active.id, Math.round(point.x - active.offset.x), Math.round(point.y - active.offset.y));
    } else if (active.kind === 'rotate') {
      const dx = point.x - active.center.x, dy = point.y - active.center.y;
      if (Math.hypot(dx, dy) < pixel) return;
      const direction = Math.atan2(dy, dx);
      active.startDirection ??= direction;
      const angle = active.initialAngle + (direction - active.startDirection) * 180 / Math.PI;
      rotate(active.id, ((Math.round(angle) % 360) + 360) % 360);
    } else {
      const { diagonal, pivot } = active;
      const lengthSquared = diagonal.x ** 2 + diagonal.y ** 2;
      if (!lengthSquared) return;
      const factor = ((point.x - pivot.x) * diagonal.x + (point.y - pivot.y) * diagonal.y) / lengthSquared;
      resize(active.id, Math.max(.0001, Math.min(9999, active.initialScale * factor)), pivot);
    }
  }

  function stop(event: PointerEvent<SVGSVGElement>) {
    if (boxStart.current?.pointerId === event.pointerId) {
      const rect = boxAt(event);
      if (event.type === 'pointerup' && rect && rect.width > 0 && rect.height > 0) {
        const enclosed = layers.filter((layer) => {
          const asset = assets.get(layer.assetId);
          if (!asset) return false;
          const theta = layer.rotation * Math.PI / 180;
          const c = Math.cos(theta), s = Math.sin(theta);
          const w = layer.scale * asset.width / 2, h = layer.scale * asset.height / 2;
          const rw = rect.width / 2, rh = rect.height / 2;
          const dx = layer.x - (rect.x + rw), dy = layer.y - (rect.y + rh);
          // Two rectangles overlap if their projections touch on all four edge normals.
          return Math.abs(dx) <= rw + w * Math.abs(c) + h * Math.abs(s) &&
            Math.abs(dy) <= rh + w * Math.abs(s) + h * Math.abs(c) &&
            Math.abs(dx * c + dy * s) <= w + rw * Math.abs(c) + rh * Math.abs(s) &&
            Math.abs(-dx * s + dy * c) <= h + rw * Math.abs(s) + rh * Math.abs(c);
        });
        select(enclosed.map((layer) => layer.id));
      }
      boxStart.current = null;
      setBox(null);
    }
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') { select([]); return; }
    const layer = layers.find(({ id }) => id === selectedIds[0]);
    if (!layer) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (selectedIds.length === 1) remove(layer.id);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = arrows[event.key];
    if (direction) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      move(selectedIds, layer.id, layer.x + direction[0] * step, layer.y + direction[1] * step);
    }
  }

  return <CanvasViewport artboard={artboard}>
    <svg className="scene" ref={canvas} viewBox={'0 0 ' + artboard.width + ' ' + artboard.height}
      tabIndex={0} aria-label="Интерактивный холст"
      onPointerDown={beginBox} onPointerMove={update} onPointerUp={stop}
      onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={onKey}>
      {layers.map((layer) => {
        const asset = assets.get(layer.assetId);
        if (!asset) return null;
        return <g key={layer.id} data-layer={layer.id} transform={layerTransform(layer)}
          onPointerDown={(event) => start(event, layer, event.ctrlKey || event.metaKey ? 'rotate' : 'move')}>
          <VectorObject asset={asset} id={layer.id} colorSlots={layer.colorSlots} palette={palettes.get(asset.id) ?? emptyPalette} />
          <rect className={selectedIds.includes(layer.id) ? 'layer-hit selected' : 'layer-hit'}
            x={-asset.width / 2} y={-asset.height / 2} width={asset.width} height={asset.height}
            fill="transparent" vectorEffect="non-scaling-stroke" />
        </g>;
      })}
      {selected && asset && <g className="layer-controls"
        transform={'translate(' + selected.x + ' ' + selected.y + ') rotate(' + selected.rotation + ')'}>
        <line y1={-halfHeight} y2={-halfHeight - 22 * pixel} stroke="#683ae4" vectorEffect="non-scaling-stroke" />
        <g transform={'translate(0 ' + (-halfHeight - 22 * pixel) + ')'} className="rotate-handle"
          aria-label="Повернуть объект мышью" onPointerDown={(event) => start(event, selected, 'rotate')}>
          <title>Повернуть объект</title>
          <circle r={12 * pixel} fill="transparent" />
          <circle r={6 * pixel} className="handle-mark" vectorEffect="non-scaling-stroke" />
        </g>
        <g transform={'translate(' + halfWidth + ' ' + halfHeight + ')'} className="scale-handle"
          aria-label="Изменить размер композиции мышью" onPointerDown={(event) => start(event, selected, 'resize')}>
          <title>Изменить размер всей композиции</title>
          <circle r={12 * pixel} fill="transparent" />
          <rect x={-5 * pixel} y={-5 * pixel} width={10 * pixel} height={10 * pixel}
            className="handle-mark" vectorEffect="non-scaling-stroke" />
        </g>
      </g>}
      {box && <rect {...box} fill="#683ae41a" stroke="#683ae4" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
    </svg>
    {layers.length === 0 && <div className="canvas-empty">
      <Layers size={32} strokeWidth={1.6} />
      <strong>Холст пуст</strong>
      <span>Добавьте объекты из библиотеки</span>
    </div>}
  </CanvasViewport>;
}
