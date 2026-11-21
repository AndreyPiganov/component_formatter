const svgNamespace = 'http://www.w3.org/2000/svg';
const xlinkNamespace = 'http://www.w3.org/1999/xlink';
const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
const xmlnsNamespace = 'http://www.w3.org/2000/xmlns/';

const vectorTags = new Set((
  'svg g defs symbol use path rect circle ellipse line polyline polygon ' +
  'linearGradient radialGradient stop clipPath mask pattern marker filter ' +
  'feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting ' +
  'feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR ' +
  'feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting ' +
  'feSpotLight feTile feTurbulence title desc text tspan textPath'
).split(' '));

const paintAttributes = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];
const presentationStyles = new Set([
  ...paintAttributes, 'opacity', 'fill-opacity', 'fill-rule', 'stroke-opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stop-opacity', 'flood-opacity', 'clip-rule', 'clip-path', 'mask', 'filter', 'marker-start',
  'marker-mid', 'marker-end', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'paint-order', 'vector-effect', 'mix-blend-mode',
  'isolation', 'display', 'visibility',
]);
const localUrl = /url\(\s*["']?#([^\s)"']+)["']?\s*\)/gi;
const supportedNamespaces = new Set([null, xlinkNamespace, xmlNamespace, xmlnsNamespace]);
export const maxSvgBytes = 1024 * 1024;
export type Detail = 'detailed' | 'simple';
export type Role = 'main' | 'background';

export interface CatalogEntry {
  id: string;
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
  scale: number;
}

function parseStyle(style: string) {
  return style.split(';').filter((value) => value.trim()).map((declaration) => {
    const separator = declaration.indexOf(':');
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (separator < 1 || !value || !presentationStyles.has(property)) {
      throw new Error('В SVG найдено неподдерживаемое CSS-свойство.');
    }
    return [property, value] as const;
  });
}

function parseViewport(root: Element) {
  const parseLength = (value: string | null) =>
    /^\d*\.?\d+(?:px)?$/i.test(value?.trim() ?? '') ? Number.parseFloat(value!) : 0;
  const width = parseLength(root.getAttribute('width'));
  const height = parseLength(root.getAttribute('height'));
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox && (viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value)) ||
      viewBox[2] <= 0 || viewBox[3] <= 0)) {
    throw new Error('У SVG некорректный viewBox.');
  }
  if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) {
    return { width, height, viewBox: viewBox ?? [0, 0, width, height] };
  }
  if (viewBox) return { width: viewBox[2], height: viewBox[3], viewBox };
  throw new Error('У SVG должен быть viewBox или числовые ширина и высота.');
}

export function parseSvg(entry: CatalogEntry, markup: string): SvgAsset {
  if (new Blob([markup]).size > maxSvgBytes) throw new Error('Максимальный размер SVG — 1 МБ.');
  if (/<!DOCTYPE|<\?(?!xml\s)/i.test(markup)) {
    throw new Error('SVG содержит нестандартные XML-инструкции.');
  }
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement as unknown as SVGSVGElement;
  if (root.localName !== 'svg' || root.namespaceURI !== svgNamespace ||
      doc.getElementsByTagName('parsererror').length) {
    throw new Error('Не удалось прочитать SVG. Проверьте XML и пространство имён SVG.');
  }
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  const ids = new Set<string>();
  const references = new Set<string>();
  const colors = new Set<string>();

  for (const element of elements) {
    if (element.namespaceURI !== svgNamespace || !vectorTags.has(element.localName)) {
      throw new Error('SVG содержит неподдерживаемый элемент <' + element.localName + '>.');
    }
    const id = element.getAttribute('id');
    if (id) {
      if (ids.has(id)) throw new Error('В SVG повторяется идентификатор ' + id + '.');
      ids.add(id);
    }
    for (const attribute of Array.from(element.attributes)) {
      const { localName, value, namespaceURI } = attribute;
      if (!supportedNamespaces.has(namespaceURI) || /^on/i.test(localName) ||
          (namespaceURI === xmlNamespace && localName === 'base') || localName === 'src') {
        throw new Error('SVG содержит неподдерживаемый атрибут ' + attribute.name + '.');
      }
      if (namespaceURI === xmlnsNamespace) continue;
      if (localName === 'href') {
        if (!/^#[^\s]+$/.test(value)) throw new Error('SVG может ссылаться только на свои элементы.');
        references.add(value.slice(1));
      }
      if (localName === 'style') parseStyle(value);
      if (localName === 'id' || localName === 'd') continue;
      const withoutLocalUrls = value.replace(localUrl, (_, target: string) => {
        references.add(target);
        return '';
      });
      if (/url\s*\(|\\|\/\*/i.test(withoutLocalUrls)) {
        throw new Error('SVG может использовать только локальные графические ресурсы.');
      }
    }
    element.removeAttribute('class');
  }
  for (const id of references) {
    if (!ids.has(id)) throw new Error('В файле отсутствует определение #' + id + '.');
  }

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
      if (value) collectPaint(colors, value);
    }
    for (const [property, value] of parseStyle(element.getAttribute('style') ?? '')) {
      if (paintAttributes.includes(property)) collectPaint(colors, value);
    }
  }
  const { width, height, viewBox } = parseViewport(root);
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

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = rgb.map((value) => value <= 0.04045 ?
    value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
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

export function renderAsset(asset: SvgAsset, instanceId: string, palette: ReadonlyMap<string, string>) {
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
    const replacement = paint && paint.alpha !== '00' ? palette.get(paint.hex) : undefined;
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
  root.setAttribute('x', String(-asset.width / 2));
  root.setAttribute('y', String(-asset.height / 2));
  return serialize(root);
}

export function layerTransform(layer: Layer) {
  return 'translate(' + layer.x + ' ' + layer.y + ') rotate(' + layer.rotation + ') scale(' + layer.scale + ')';
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
      renderAsset(asset, layer.id, palettes.get(asset.id) ?? new Map()) + '</g>';
  }).join('');
  return opening + fill + objects + '</svg>';
}
