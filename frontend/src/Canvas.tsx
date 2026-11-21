import { memo, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { CanvasViewport } from './CanvasViewport';
import { Layers } from 'lucide-react';
import { layerTransform, renderAsset, type Artboard, type Layer, type SvgAsset } from './svg';

interface CanvasProps {
  artboard: Artboard;
  layers: Layer[];
  assets: ReadonlyMap<string, SvgAsset>;
  palettes: ReadonlyMap<string, ReadonlyMap<string, string>>;
  selectedId: string | null;
  select: (id: string | null) => void;
  move: (id: string, x: number, y: number) => void;
  remove: (id: string) => void;
}

const emptyPalette = new Map<string, string>();
const VectorObject = memo(function VectorObject({ asset, id, palette, colorSlots }: {
  asset: SvgAsset; id: string; palette: ReadonlyMap<string, string>; colorSlots?: Layer['colorSlots'];
}) {
  const markup = useMemo(() => renderAsset(asset, 'preview-' + id, palette, colorSlots), [asset, id, palette, colorSlots]);
  return <g aria-hidden="true" pointerEvents="none" dangerouslySetInnerHTML={{ __html: markup }} />;
});

export function Canvas({ artboard, layers, assets, palettes, selectedId, select, move, remove }: CanvasProps) {
  const canvas = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number } | null>(null);

  function pointerPosition(event: PointerEvent<SVGElement>) {
    const matrix = canvas.current?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }

  function start(event: PointerEvent<SVGGElement>, layer: Layer) {
    if (event.button !== 0 || drag.current) return;
    const point = pointerPosition(event);
    if (!point || !canvas.current) return;
    event.stopPropagation();
    canvas.current.focus();
    canvas.current.setPointerCapture(event.pointerId);
    drag.current = { id: layer.id, pointerId: event.pointerId, offsetX: point.x - layer.x, offsetY: point.y - layer.y };
    select(layer.id);
  }

  function update(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = pointerPosition(event);
    if (point) {
      move(active.id, Math.round(point.x - active.offsetX), Math.round(point.y - active.offsetY));
    }
  }

  function stop(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    const layer = layers.find(({ id }) => id === selectedId);
    if (!layer) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(layer.id);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = arrows[event.key];
    if (direction) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      move(layer.id, layer.x + direction[0] * step, layer.y + direction[1] * step);
    }
  }

  return <CanvasViewport artboard={artboard}>
    <svg className="scene" ref={canvas} viewBox={'0 0 ' + artboard.width + ' ' + artboard.height}
      tabIndex={0} aria-label="Интерактивный холст"
      onPointerDown={() => select(null)} onPointerMove={update} onPointerUp={stop}
      onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={onKey}>
      {layers.map((layer) => {
        const asset = assets.get(layer.assetId);
        if (!asset) return null;
        return <g key={layer.id} data-layer={layer.id} transform={layerTransform(layer)}
          onPointerDown={(event) => start(event, layer)}>
          <VectorObject asset={asset} id={layer.id} colorSlots={layer.colorSlots} palette={palettes.get(asset.id) ?? emptyPalette} />
          <rect className={layer.id === selectedId ? 'layer-hit selected' : 'layer-hit'}
            x={-asset.width / 2} y={-asset.height / 2} width={asset.width} height={asset.height}
            fill="transparent" vectorEffect="non-scaling-stroke" />
        </g>;
      })}
    </svg>
    {layers.length === 0 && <div className="canvas-empty">
      <Layers size={32} strokeWidth={1.6} />
      <strong>Холст пуст</strong>
      <span>Добавьте объекты из библиотеки</span>
    </div>}
  </CanvasViewport>;
}
