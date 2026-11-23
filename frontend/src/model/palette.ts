import { mapPalette, type SvgAsset } from './svg';

import { readScheme, schemes, type Scheme } from '../../../backend/src/common/svg/palette';
export { schemes, type Scheme };

export function parseScheme(input: string): Scheme {
  return readScheme(JSON.parse(input));
}

export function schemeColors(scheme: Scheme, role: SvgAsset['role']) {
  return role === 'background' ? scheme.background : [...scheme.background, ...scheme.objects];
}

export function sceneColorOptions(palettes: Scheme[], assets: SvgAsset[]) {
  const paints = Object.fromEntries(assets.map(asset => {
    const base = schemeColors(schemes[0], asset.role);
    return [asset.id, base.flatMap((color, slot) => asset.colors.includes(color) ? [slot] : [])];
  }));
  return { palettes, paints };
}

export function assetPalette(asset: SvgAsset, scheme: Scheme | undefined) {
  if (!scheme) return new Map<string, string>();
  const base = schemeColors(schemes[0], asset.role);
  const target = schemeColors(scheme, asset.role);
  const replacements = mapPalette(asset.colors.filter((color) => !base.includes(color)), target);
  base.forEach((color, index) => replacements.set(color, target[index]));
  return replacements;
}
