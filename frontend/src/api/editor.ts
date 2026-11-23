import { referenceSizedAssets } from '../model/scene';
import type { ScenePlacement } from '../../../backend/src/common/svg/placement';
import type { SceneColorOptions, SceneColors } from '../../../backend/src/common/svg/palette';
import { parseSvg, type CatalogEntry, type Detail, type SvgAsset } from '../model/svg';

export type CompositionMode = 'names' | 'metaphor';

interface Selection {
  ids: string[];
  placements?: ScenePlacement[];
  colors?: SceneColors;
  unmatched: string[];
  method: 'names' | 'keywords' | 'ai';
}

export async function loadLibrary(signal: AbortSignal) {
  const response = await fetch('/api/library', { signal });
  if (!response.ok) throw new Error('Библиотека сервиса временно недоступна.');
  const data = await response.json() as { entries: (CatalogEntry & { svg: string })[]; skipped: number };
  const assets: SvgAsset[] = [];
  let skipped = data.skipped;
  for (const { svg, ...entry } of data.entries) {
    try {
      assets.push(parseSvg(entry, svg));
    } catch {
      skipped++;
    }
  }
  return { assets: referenceSizedAssets(assets), skipped };
}

export async function selectObjects(mode: CompositionMode, text: string, detail: Detail, colorOptions?: SceneColorOptions) {
  const response = await fetch('/api/compositions/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, text, detail, colorOptions }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error('Не удалось собрать композицию. Проверьте запрос и повторите.');
  return await response.json() as Selection;
}
