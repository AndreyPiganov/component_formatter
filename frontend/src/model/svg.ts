import { luminance } from '../../../backend/src/common/svg/palette';
import {
  checkSvgMarkup, localUrl, paintAttributes, parseStyle, parseViewport,
  svgNamespace, VectorDocumentCheck, xmlnsNamespace,
} from '../../../backend/src/common/svg/validation';
export { maxSvgBytes } from '../../../backend/src/common/svg/validation';

export type Detail = 'detailed' | 'simple';
export type Role = 'main' | 'background';

export interface CatalogEntry {
  id: string;
  componentId?: string;
  name: string;
  source: string;
  tags: string[];
  role: Role;
  detail: Detail | 'any';
}

export interface SvgAsset extends CatalogEntry {
  root: SVGSVGElement;
  width: number;
  height: number;
  colors: string[];
  thumbnail: string;
}

export interface Artboard {
  width: number;
  height: number;
  background: string;
}

export interface Layer {
  id: string;
  assetId: string;
  x: number;
  y: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  scale: number;
  colorSlots?: Record<string, string>;
}

export function parseSvg(entry: CatalogEntry, markup: string): SvgAsset {
  checkSvgMarkup(markup);
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement as unknown as SVGSVGElement;
  if (root.localName !== 'svg' || root.namespaceURI !== svgNamespace ||
      doc.getElementsByTagName('parsererror').length) {
    throw new Error('Не удалось прочитать SVG. Проверьте XML и пространство имён SVG.');
  }
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  const check = new VectorDocumentCheck();
  const colors = new Set<string>();
  for (const element of elements) {
    check.element(element.namespaceURI, element.localName, element.getAttribute('id'), element.attributes);
    element.removeAttribute('class');
  }
  check.finish();

  const usesCurrentColor = elements.some((element) => Array.from(element.attributes)
    .some(({ value }) => /\bcurrentcolor\b/i.test(value)));
  // Make the SVG initial paints explicit so the palette can recolor inherited shapes too.
  const rootStyle = new Map(parseStyle(root.getAttribute('style') ?? ''));
  for (const attribute of ['fill', 'color']) {
    if (!root.hasAttribute(attribute) && !rootStyle.has(attribute)) {
      root.setAttribute(attribute, '#000000');
    }
  }
  for (const element of elements) {
    if (element.localName === 'stop' && !element.hasAttribute('stop-color') &&
        !new Map(parseStyle(element.getAttribute('style') ?? '')).has('stop-color')) {
      element.setAttribute('stop-color', '#000000');
    }
    for (const attribute of paintAttributes) {
      const value = element.getAttribute(attribute);
      if (value && (attribute !== 'color' || usesCurrentColor)) collectPaint(colors, value);
    }
    for (const [property, value] of parseStyle(element.getAttribute('style') ?? '')) {
      if (paintAttributes.includes(property) && (property !== 'color' || usesCurrentColor)) collectPaint(colors, value);
    }
  }
  const { width, height, viewBox } = parseViewport((name) => root.getAttribute(name));
  root.setAttribute('x', '0');
  root.setAttribute('y', '0');
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', viewBox.join(' '));
  const thumbnail = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialize(root));
  return { ...entry, root, width, height, colors: [...colors], thumbnail };
}

function parsePaint(value: string): { hex: string; alpha: string } | undefined {
  const color = value.trim().toLowerCase();
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(color)) {
    const digits = color.slice(1);
    const expanded = digits.length < 5 ? [...digits].map((digit) => digit.repeat(2)).join('') : digits;
    return { hex: '#' + expanded.slice(0, 6), alpha: expanded.slice(6) };
  }
  if (color === 'transparent') return { hex: '#000000', alpha: '00' };
  if (color === 'white' || color === 'black') {
    return { hex: color === 'white' ? '#ffffff' : '#000000', alpha: '' };
  }
  if (/^(?:none|currentcolor|inherit|initial|unset|revert)$|^url\(/.test(color)) return;
  const probe = document.createElement('span');
  probe.style.color = color;
  if (!probe.style.color) return;
  const computed = getComputedStyle(probe).color || probe.style.color;
  const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!match) return;
  const byte = (input: number) => Math.round(input).toString(16).padStart(2, '0');
  return {
    hex: '#' + match.slice(1, 4).map((channel) => byte(Number(channel))).join(''),
    alpha: match[4] ? byte(Number(match[4]) * 255) : '',
  };
}

function collectPaint(colors: Set<string>, value: string) {
  const paint = parsePaint(value.replace(/\s*!important\s*$/i, ''));
  if (paint && paint.alpha !== '00') colors.add(paint.hex);
}

export function mapPalette(sources: string[], palette: string[]) {
  const replacements = new Map<string, string>();
  if (palette.length === 0) return replacements;
  const sorted = (values: string[]) =>
    [...new Set(values)].sort((a, b) => luminance(a) - luminance(b) || a.localeCompare(b));
  const from = sorted(sources);
  const to = sorted(palette);
  from.forEach((color, index) => {
    const rank = from.length === 1 ? 0 : index / (from.length - 1);
    replacements.set(color, to[Math.round(rank * (to.length - 1))]);
  });
  return replacements;
}

function serialize(element: Element) {
  return new XMLSerializer().serializeToString(element);
}

export function renderAsset(asset: SvgAsset, instanceId: string, palette: ReadonlyMap<string, string>,
  colorSlots?: Layer['colorSlots']) {
  const root = asset.root.cloneNode(true) as SVGSVGElement;
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  const replacements = new Map<string, string>();
  for (const element of elements) {
    const id = element.getAttribute('id');
    if (id) {
      const newId = instanceId + '-' + replacements.size;
      replacements.set(id, newId);
      element.setAttribute('id', newId);
    }
  }
  const recolor = (value: string) => {
    if (!palette.size) return value;
    const important = value.match(/\s*!important\s*$/i)?.[0] ?? '';
    const paint = parsePaint(important ? value.slice(0, -important.length) : value);
    const replacement = paint && paint.alpha !== '00' ? palette.get(colorSlots?.[paint.hex] ?? paint.hex) : undefined;
    return replacement ? replacement + paint!.alpha + important : value;
  };
  const replaceUrls = (value: string) =>
    value.replace(localUrl, (_, id: string) => 'url(#' + replacements.get(id) + ')');

  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      const { localName, value } = attribute;
      if (localName === 'href') {
        attribute.value = '#' + replacements.get(value.slice(1));
      } else if (localName === 'style') {
        attribute.value = parseStyle(value).map(([property, original]) => {
          const updated = paintAttributes.includes(property) ? recolor(original) : original;
          return property + ':' + replaceUrls(updated);
        }).join(';');
      } else if (paintAttributes.includes(localName)) {
        attribute.value = replaceUrls(recolor(value));
      } else if (localName !== 'id' && localName !== 'd' && attribute.namespaceURI !== xmlnsNamespace) {
        attribute.value = replaceUrls(value);
      }
    }
  }
  root.setAttribute('width', String(asset.width));
  root.setAttribute('height', String(asset.height));
  root.setAttribute('x', String(-asset.width / 2));
  root.setAttribute('y', String(-asset.height / 2));
  return serialize(root);
}

export function layerTransform(layer: Layer) {
  const scale = layer.flipX || layer.flipY
    ? [layer.flipX ? -layer.scale : layer.scale, layer.flipY ? -layer.scale : layer.scale].join(' ')
    : String(layer.scale);
  return 'translate(' + layer.x + ' ' + layer.y + ') rotate(' + layer.rotation + ') scale(' + scale + ')';
}

export function newId() {
  return 'object-' + Array.from(crypto.getRandomValues(new Uint32Array(3)), (part) =>
    part.toString(16)).join('-');
}

export function exportSvg(
  artboard: Artboard, layers: Layer[], assets: ReadonlyMap<string, SvgAsset>,
  palettes: ReadonlyMap<string, ReadonlyMap<string, string>>,
) {
  const { width, height, background } = artboard;
  const opening = '<svg xmlns="' + svgNamespace + '" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '">';
  const fill = background === 'transparent' ? '' :
    '<rect width="100%" height="100%" fill="' + background + '"/>';
  const objects = layers.map((layer) => {
    const asset = assets.get(layer.assetId);
    if (!asset) return '';
    return '<g id="' + layer.id + '" transform="' + layerTransform(layer) + '">' +
      renderAsset(asset, layer.id, palettes.get(asset.id) ?? new Map(), layer.colorSlots) + '</g>';
  }).join('');
  return opening + fill + objects + '</svg>';
}
