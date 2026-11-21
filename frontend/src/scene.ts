import { newId, type Artboard, type Detail, type Layer, type SvgAsset } from './svg';

export const formats = [
  { name: '1000 × 1000 · Детальный', width: 1000, height: 1000, detail: 'detailed' },
  { name: '500 × 500 · Компактный', width: 500, height: 500, detail: 'simple' },
  { name: '1200 × 630 · Обложка', width: 1200, height: 630, detail: 'detailed' },
] satisfies { name: string; width: number; height: number; detail: Detail }[];

export function visibleAssets(assets: SvgAsset[], detail: Detail) {
  const available = new Map<string, SvgAsset>();
  for (const asset of assets) {
    if (asset.detail === detail || (asset.detail === 'any' && !available.has(asset.id))) available.set(asset.id, asset);
  }
  return available;
}

// Existing layers keep their only vector when the requested size is unavailable.
export function assetsForLayers(assets: SvgAsset[], available: ReadonlyMap<string, SvgAsset>) {
  const resolved = new Map(available);
  for (const asset of assets) {
    if (!resolved.has(asset.id)) resolved.set(asset.id, asset);
  }
  return resolved;
}

export function placeAsset(asset: SvgAsset, artboard: Artboard, x = artboard.width / 2, y = artboard.height / 2) {
  return {
    id: newId(), assetId: asset.id, x, y, rotation: 0,
    scale: Math.min(artboard.width * 0.5 / asset.width, artboard.height * 0.52 / asset.height),
  } satisfies Layer;
}

export function resizeLayers(
  layers: Layer[], before: Artboard, after: Artboard,
  oldAssets: ReadonlyMap<string, SvgAsset>, newAssets: ReadonlyMap<string, SvgAsset>,
) {
  const ratio = Math.min(after.width / before.width, after.height / before.height);
  return layers.flatMap((layer) => {
    const oldAsset = oldAssets.get(layer.assetId);
    const newAsset = newAssets.get(layer.assetId);
    if (!oldAsset || !newAsset) return [];
    return [{
      ...layer,
      x: layer.x * after.width / before.width,
      y: layer.y * after.height / before.height,
      scale: layer.scale * ratio * Math.max(oldAsset.width, oldAsset.height) /
        Math.max(newAsset.width, newAsset.height),
    }];
  });
}

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

function slots(count: number, artboard: Artboard): Slot[] {
  if (count === 1) return [{ x: .5, y: .51, w: .72, h: .7 }];
  if (count === 2) return [
    { x: .32, y: .54, w: .47, h: .65 },
    { x: .73, y: .43, w: .33, h: .46 },
  ];
  if (count === 3 || count === 4) {
    return [
      { x: .33, y: .54, w: .48, h: .7 },
      ...Array.from({ length: count - 1 }, (_, index) => ({
        x: .76, y: (index + 0.5) / (count - 1) * .84 + .08, w: .3, h: .76 / (count - 1),
      })),
    ];
  }
  const columns = artboard.width / artboard.height > 1.4 ? Math.ceil(count / 2) : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    return {
      x: (index % columns + .5) / rowCount,
      y: (row + .5) / rows,
      w: .83 / columns, h: .76 / rows,
    };
  });
}

export function arrangeObjects(assets: SvgAsset[], artboard: Artboard): Layer[] {
  if (!assets.length) return [];
  const foreground = assets.filter((asset) => asset.role === 'main');
  const background = assets.filter((asset) => asset.role === 'background');
  const focus = foreground.length ? foreground : background;
  const frame = slots(focus.length, artboard);
  const inSlot = (asset: SvgAsset, slot: Slot): Layer => ({
    id: newId(), assetId: asset.id, rotation: 0,
    x: Math.round(slot.x * artboard.width), y: Math.round(slot.y * artboard.height),
    scale: Math.min(slot.w * artboard.width / asset.width, slot.h * artboard.height / asset.height),
  });
  const accents = foreground.length ? background.map((asset, index) => inSlot(asset, {
    x: (index + .5) / background.length, y: index % 2 === 0 ? .78 : .24,
    w: Math.min(.42, .88 / background.length), h: .37,
  })) : [];
  return [...accents, ...focus.map((asset, index) => inSlot(asset, frame[index]))];
}
