export const svgNamespace = 'http://www.w3.org/2000/svg';
const xlinkNamespace = 'http://www.w3.org/1999/xlink';
const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
export const xmlnsNamespace = 'http://www.w3.org/2000/xmlns/';

const vectorTags = new Set((
  'svg g defs symbol use path rect circle ellipse line polyline polygon ' +
  'linearGradient radialGradient stop clipPath mask pattern marker filter ' +
  'feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting ' +
  'feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR ' +
  'feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting ' +
  'feSpotLight feTile feTurbulence title desc text tspan textPath'
).split(' '));

export const paintAttributes = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];
const presentationStyles = new Set([
  ...paintAttributes, 'opacity', 'fill-opacity', 'fill-rule', 'stroke-opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stop-opacity', 'flood-opacity', 'clip-rule', 'clip-path', 'mask', 'filter', 'marker-start',
  'marker-mid', 'marker-end', 'font-family', 'font-size', 'font-style', 'font-weight', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'paint-order', 'vector-effect', 'mix-blend-mode',
  'isolation', 'display', 'visibility',
]);
export const localUrl = /url\(\s*["']?#([^\s)"']+)["']?\s*\)/gi;
const supportedNamespaces = new Set([null, xlinkNamespace, xmlNamespace, xmlnsNamespace]);
export const maxSvgBytes = 1024 * 1024;

export function parseStyle(style: string) {
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

export function parseViewport(getAttribute: (name: string) => string | null) {
  const parseLength = (value: string | null) =>
    /^\d*\.?\d+(?:px)?$/i.test(value?.trim() ?? '') ? Number.parseFloat(value!) : 0;
  const width = parseLength(getAttribute('width'));
  const height = parseLength(getAttribute('height'));
  const viewBox = getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
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

export function checkSvgMarkup(markup: string) {
  if (new TextEncoder().encode(markup).length > maxSvgBytes) throw new Error('Максимальный размер SVG — 1 МБ.');
  if (/<!DOCTYPE|<\?(?!xml\s)/i.test(markup)) {
    throw new Error('SVG содержит нестандартные XML-инструкции.');
  }
}

interface SvgAttribute {
  name: string;
  localName: string;
  namespaceURI: string | null;
  value: string;
}

export class VectorDocumentCheck {
  private readonly ids = new Set<string>();
  private readonly references = new Set<string>();

  element(namespaceURI: string | null, localName: string, id: string | null, attributes: Iterable<SvgAttribute>) {
    if (namespaceURI !== svgNamespace || !vectorTags.has(localName)) {
      throw new Error('SVG содержит неподдерживаемый элемент <' + localName + '>.');
    }
    if (id) {
      if (this.ids.has(id)) throw new Error('В SVG повторяется идентификатор ' + id + '.');
      this.ids.add(id);
    }
    for (const attribute of attributes) {
      const { localName, value, namespaceURI } = attribute;
      if (!supportedNamespaces.has(namespaceURI) || /^on/i.test(localName) ||
          (namespaceURI === xmlNamespace && localName === 'base') || localName === 'src') {
        throw new Error('SVG содержит неподдерживаемый атрибут ' + attribute.name + '.');
      }
      if (namespaceURI === xmlnsNamespace) continue;
      if (localName === 'href') {
        if (!/^#[^\s]+$/.test(value)) throw new Error('SVG может ссылаться только на свои элементы.');
        this.references.add(value.slice(1));
      }
      if (localName === 'style') parseStyle(value);
      if (localName === 'id' || localName === 'd') continue;
      const withoutLocalUrls = value.replace(localUrl, (_, target: string) => {
        this.references.add(target);
        return '';
      });
      if (/url\s*\(|\\|\/\*/i.test(withoutLocalUrls)) {
        throw new Error('SVG может использовать только локальные графические ресурсы.');
      }
    }
  }

  finish() {
    for (const id of this.references) {
      if (!this.ids.has(id)) throw new Error('В файле отсутствует определение #' + id + '.');
    }
  }
}
