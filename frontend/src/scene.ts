import { newId, type Artboard, type Detail, type Layer, type SvgAsset } from './svg';

export const formats = [
  { name: '1000 × 1000 · Детальный', width: 1000, height: 1000, detail: 'detailed' },
  { name: '500 × 500 · Компактный', width: 500, height: 500, detail: 'simple' },
  { name: '1200 × 630 · Обложка', width: 1200, height: 630, detail: 'detailed' },
] satisfies { name: string; width: number; height: number; detail: Detail }[];

export function visibleAssets(assets: SvgAsset[], detail: Detail) {
  return new Map(assets.filter((asset) => asset.detail === detail || asset.detail === 'any')
    .map((asset) => [asset.id, asset]));
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
