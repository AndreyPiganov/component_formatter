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

export function readScheme(value: unknown): Scheme {
  const scheme = value as Partial<Scheme> | null;
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

export interface SceneColorOptions {
  palettes: Scheme[];
  // Canonical Figma paint slots present in each visible SVG variant.
  paints: Record<string, number[]>;
}

export interface SceneColors {
  schemeIndex: number;
  background: number;
}

export interface PaintChange {
  from: number;
  to: number;
}

export function luminance(hex: string) {
  const rgb = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = rgb.map(value => value <= 0.04045 ?
    value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
