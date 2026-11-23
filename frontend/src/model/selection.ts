import type { Layer, SvgAsset } from './svg';

export interface SelectionFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  members: Map<string, Layer>;
}

export function selectionFrame(layers: Layer[], ids: string[], assets: ReadonlyMap<string, SvgAsset>): SelectionFrame | undefined {
  if (!ids.length) return;
  const wanted = new Set(ids);
  const members = layers.filter(layer => wanted.has(layer.id));
  if (!members.length || members.length !== wanted.size) return;

  // Measure in the first layer's axes so the bounding box turns with the selection.
  const anchor = members[0];
  const radians = anchor.rotation * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const layer of members) {
    const asset = assets.get(layer.assetId);
    if (!asset) return;
    const dx = layer.x - anchor.x, dy = layer.y - anchor.y;
    const x = dx * c + dy * s, y = -dx * s + dy * c;
    const angle = (layer.rotation - anchor.rotation) * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
    const halfWidth = (asset.width * cos + asset.height * sin) * layer.scale / 2;
    const halfHeight = (asset.width * sin + asset.height * cos) * layer.scale / 2;
    left = Math.min(left, x - halfWidth);
    right = Math.max(right, x + halfWidth);
    top = Math.min(top, y - halfHeight);
    bottom = Math.max(bottom, y + halfHeight);
  }
  const x = (left + right) / 2, y = (top + bottom) / 2;
  return {
    x: anchor.x + x * c - y * s, y: anchor.y + x * s + y * c,
    width: right - left, height: bottom - top, rotation: anchor.rotation,
    members: new Map(members.map(layer => [layer.id, layer])),
  };
}

export function rotateSelection(layers: Layer[], frame: SelectionFrame, angle: number): Layer[] {
  const delta = angle - frame.rotation;
  const radians = delta * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return layers.map(layer => {
    const start = frame.members.get(layer.id);
    if (!start) return layer;
    const dx = start.x - frame.x, dy = start.y - frame.y;
    return { ...layer, x: frame.x + dx * c - dy * s, y: frame.y + dx * s + dy * c,
      rotation: ((start.rotation + delta) % 360 + 360) % 360 };
  });
}
