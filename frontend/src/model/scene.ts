import { newId, type Artboard, type Detail, type Layer, type SvgAsset } from './svg';
import type { ScenePlacement } from '../../../backend/src/common/svg/placement';
import { schemeColors, schemes } from './palette';

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

// Variants share a subject's physical size. Their own aspect ratio and viewBox stay intact.
export function referenceSizedAssets(assets: SvgAsset[]): SvgAsset[] {
  const references = new Map<string, SvgAsset>();
  const priority = (asset: SvgAsset) =>
    (asset.detail === 'detailed' ? 4 : asset.detail === 'any' ? 2 : 0) + Number(asset.role === 'main');
  for (const asset of assets) {
    const key = asset.componentId ?? asset.id;
    const previous = references.get(key);
    if (!previous || priority(asset) > priority(previous)) references.set(key, asset);
  }
  return assets.map((asset) => {
    const reference = references.get(asset.componentId ?? asset.id)!;
    const ratio = Math.max(reference.width, reference.height) / Math.max(asset.width, asset.height);
    return ratio === 1 ? asset : { ...asset, width: asset.width * ratio, height: asset.height * ratio };
  });
}

export function initialScale(assets: Iterable<SvgAsset>, board: Artboard) {
  let width = 0, height = 0;
  for (const asset of assets) {
    width = Math.max(width, asset.width);
    height = Math.max(height, asset.height);
  }
  return Math.min(board.width * .5 / width, board.height * .52 / height);
}

export function placeAsset(asset: SvgAsset, artboard: Artboard, x = artboard.width / 2, y = artboard.height / 2,
  scale = initialScale([asset], artboard)): Layer {
  return { id: newId(), assetId: asset.id, x, y, rotation: 0, scale };
}

export function scaleComposition(layers: Layer[], factor: number, pivot: { x: number; y: number }) {
  return layers.map((layer) => ({
    ...layer,
    x: pivot.x + (layer.x - pivot.x) * factor,
    y: pivot.y + (layer.y - pivot.y) * factor,
    scale: layer.scale * factor,
  }));
}

export function resizeLayers(layers: Layer[], before: Artboard, after: Artboard) {
  const ratio = Math.min(after.width, after.height) / Math.min(before.width, before.height);
  return layers.map((layer) => ({
    ...layer,
    x: layer.x * after.width / before.width,
    y: layer.y * after.height / before.height,
    scale: layer.scale * ratio,
  }));
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

interface PlacedObject {
  asset: SvgAsset;
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
  rotation: number;
  depth: number;
  colorSlots?: Layer['colorSlots'];
}

function coveredFraction(rear: PlacedObject, front: PlacedObject, x: number, y: number) {
  const width = Math.min(x + rear.halfWidth, front.x + front.halfWidth)
    - Math.max(x - rear.halfWidth, front.x - front.halfWidth);
  const height = Math.min(y + rear.halfHeight, front.y + front.halfHeight)
    - Math.max(y - rear.halfHeight, front.y - front.halfHeight);
  return Math.max(0, width) * Math.max(0, height) / (4 * rear.halfWidth * rear.halfHeight);
}

// Keep intentional contact. Only move a rear silhouette if a nearer layer covers almost all of its bounds.
function revealHiddenObjects(objects: PlacedObject[]) {
  for (let i = objects.length - 2; i >= 0; i--) {
    const rear = objects[i];
    const front = objects.slice(i + 1);
    if (!front.some(other => coveredFraction(rear, other, rear.x, rear.y) > .87)) continue;
    const edges = front.flatMap(other => [
      { x: other.x - other.halfWidth, y: rear.y }, { x: other.x + other.halfWidth, y: rear.y },
      { x: rear.x, y: other.y - other.halfHeight }, { x: rear.x, y: other.y + other.halfHeight },
    ]);
    const nearest = edges.filter(({ x, y }) => front.every(other => coveredFraction(rear, other, x, y) <= .55))
      .sort((a, b) => Math.hypot(a.x - rear.x, a.y - rear.y) - Math.hypot(b.x - rear.x, b.y - rear.y))[0];
    if (nearest) Object.assign(rear, nearest);
  }
}

function arrangeScene(assets: SvgAsset[], artboard: Artboard, plan: ScenePlacement[]): Layer[] | undefined {
  if (assets.length !== plan.length) return;
  const positions = new Map<string, PlacedObject>();
  for (const [index, asset] of assets.entries()) {
    const { assetId, relativeTo, rotation, dx, dy, depth = 0 } = plan[index];
    const anchor = relativeTo === null ? undefined : positions.get(relativeTo);
    if (assetId !== asset.id || (index > 0 && !anchor)) return;
    const angle = rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
    const halfWidth = (asset.width * cos + asset.height * sin) / 2;
    const halfHeight = (asset.width * sin + asset.height * cos) / 2;
    // Isometric drawings leave the corners of their viewBoxes empty. Measure a diagonal
    // offset to the edge of a diamond so two apparently overlapping boxes don't float apart.
    const distance = Math.abs(dx) + Math.abs(dy);
    const diagonal = distance ? Math.max(Math.abs(dx), Math.abs(dy)) / distance : 1;
    const x = anchor ? anchor.x + dx * diagonal * (anchor.halfWidth + halfWidth) : 0;
    const y = anchor ? anchor.y + dy * diagonal * (anchor.halfHeight + halfHeight) : 0;
    const changes = plan[index].paintChanges;
    const base = schemeColors(schemes[0], asset.role);
    const colorSlots = changes?.length ? Object.fromEntries(changes.map(({ from, to }) => [base[from], base[to]])) : undefined;
    positions.set(assetId, { asset, x, y, halfWidth, halfHeight, rotation, depth, colorSlots });
  }
  const objects = Array.from(positions.values())
    .sort((a, b) => Number(a.asset.role === 'main') - Number(b.asset.role === 'main') || a.depth - b.depth);
  revealHiddenObjects(objects);
  const left = Math.min(...objects.map(o => o.x - o.halfWidth));
  const right = Math.max(...objects.map(o => o.x + o.halfWidth));
  const top = Math.min(...objects.map(o => o.y - o.halfHeight));
  const bottom = Math.max(...objects.map(o => o.y + o.halfHeight));
  const scale = .84 * Math.min(artboard.width / (right - left), artboard.height / (bottom - top));
  return objects.map(({ asset, x, y, rotation, colorSlots }) => ({
    ...placeAsset(asset, artboard,
      artboard.width / 2 + (x - (left + right) / 2) * scale,
      artboard.height / 2 + (y - (top + bottom) / 2) * scale, scale),
    rotation, colorSlots,
  }));
}

export function arrangeObjects(assets: SvgAsset[], artboard: Artboard, plan?: ScenePlacement[]): Layer[] {
  if (!assets.length) return [];
  if (plan) {
    const scene = arrangeScene(assets, artboard, plan);
    if (scene) return scene;
  }
  const foreground = assets.filter((asset) => asset.role === 'main');
  const background = assets.filter((asset) => asset.role === 'background');
  const focus = foreground.length ? foreground : background;
  const frame = slots(focus.length, artboard);
  const placements = foreground.length ? background.map((asset, index) => ({
    asset, slot: {
      x: (index + .5) / background.length, y: index % 2 === 0 ? .78 : .24,
      w: Math.min(.42, .88 / background.length), h: .37,
    },
  })) : [];
  placements.push(...focus.map((asset, index) => ({ asset, slot: frame[index] })));
  const scale = Math.min(...placements.map(({ asset, slot }) =>
    Math.min(slot.w * artboard.width / asset.width, slot.h * artboard.height / asset.height)));
  return placements.map(({ asset, slot }) => placeAsset(asset, artboard,
    Math.round(slot.x * artboard.width), Math.round(slot.y * artboard.height), scale));
}
