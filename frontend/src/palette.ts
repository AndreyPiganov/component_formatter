import { mapPalette, type SvgAsset } from './svg';

export interface Scheme {
  name: string;
  background: string[];
  objects: string[];
}

export const schemes: Scheme[] = [
  {
    name: 'Лавандовая',
    background: ['#d7cdf5', '#aa9bf0', '#7864d7', '#181817'],
    objects: ['#f9ecb0', '#f9a3aa', '#ffe3e1', '#ffffff'],
  },
  {
    name: 'Персиковая',
    background: ['#fdd7b9', '#fac896', '#d27532', '#181817'],
    objects: ['#f9ecb0', '#80dada', '#beebeb', '#ffffff'],
  },
  {
    name: 'Бирюзовая',
    background: ['#beebeb', '#80dada', '#5abebe', '#181817'],
    objects: ['#ffd4f2', '#6d7bfc', '#b6c6fe', '#ffffff'],
  },
];

export function parseScheme(input: string): Scheme {
  const scheme = JSON.parse(input) as Partial<Scheme> | null;
  const parseColors = (colors: unknown) => {
    if (!Array.isArray(colors) || colors.length !== 4 ||
        colors.some((color) => typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color))) {
      throw new Error('В каждой группе палитры должно быть четыре цвета #RRGGBB.');
    }
    return colors.map((color: string) => color.toLowerCase());
  };
  if (!scheme) throw new Error('Ожидается JSON-палитра.');
  return {
    name: typeof scheme.name === 'string' && scheme.name.trim() ? scheme.name.trim().slice(0, 60) : 'Моя палитра',
    background: parseColors(scheme.background),
    objects: parseColors(scheme.objects),
  };
}

export function schemeColors(scheme: Scheme, role: SvgAsset['role']) {
  return role === 'background' ? scheme.background : [...scheme.background, ...scheme.objects];
}

export function assetPalette(asset: SvgAsset, scheme: Scheme | undefined) {
  if (!scheme) return new Map<string, string>();
  const base = schemeColors(schemes[0], asset.role);
  const target = schemeColors(scheme, asset.role);
  const replacements = mapPalette(asset.colors.filter((color) => !base.includes(color)), target);
  base.forEach((color, index) => replacements.set(color, target[index]));
  return replacements;
}
