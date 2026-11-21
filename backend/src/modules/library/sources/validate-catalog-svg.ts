import { SaxesParser } from 'saxes';
import { checkSvgMarkup, parseViewport, svgNamespace, VectorDocumentCheck } from '../../../common/svg/validation';

export function validateCatalogSvg(svg: string) {
  checkSvgMarkup(svg);
  const check = new VectorDocumentCheck();
  const parser = new SaxesParser({ xmlns: true });
  let root = true;
  parser.on('opentag', (tag) => {
    if (root) {
      if (tag.local !== 'svg' || tag.uri !== svgNamespace) throw new Error('Ожидается корневой элемент SVG.');
      parseViewport((name) => tag.attributes[name]?.value ?? null);
      root = false;
    }
    const attributes = Object.values(tag.attributes).map(({ name, local, uri, value }) => ({
      name, localName: local, namespaceURI: uri || null, value,
    }));
    check.element(tag.uri, tag.local, tag.attributes.id?.value ?? null, attributes);
  });
  parser.write(svg).close();
  check.finish();
}
