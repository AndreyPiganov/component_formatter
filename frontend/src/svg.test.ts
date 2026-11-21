// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { assetPalette, parseScheme, schemes } from './palette';
import { formats, placeAsset, resizeLayers, visibleAssets } from './scene';
import { exportSvg, parseSvg, renderAsset, type CatalogEntry } from './svg';

const entry: CatalogEntry = {
  id: 'book', name: 'Книга', source: 'Тест', tags: [], role: 'main', detail: 'detailed',
};
const start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 6 60 20" fill="none">';
const fixture = start + '<defs><clipPath id="clip"><rect width="60" height="20"/></clipPath></defs>' +
  '<path d="M5 7L40 15Z" clip-path="url(#clip)" fill="#D7CDF580" stroke="#F9A3AA"/></svg>';

describe('vector assets', () => {
  it('preserves viewBox, path geometry and paint while isolating references between layers', () => {
    const asset = parseSvg(entry, fixture);
    const artboard = { width: 1000, height: 500, background: 'transparent' };
    const first = { ...placeAsset(asset, artboard), id: 'first', rotation: 20 };
    const second = { ...first, id: 'second', x: 250 };
    const svg = exportSvg(artboard, [first, second], new Map([[asset.id, asset]]), new Map());
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror, image')).toBeNull();
    expect(doc.querySelectorAll('g')).toHaveLength(2);
    expect(doc.querySelector('#first > svg')?.getAttribute('viewBox')).toBe('4 6 60 20');
    expect(doc.querySelector('#first')?.getAttribute('transform')).toContain('rotate(20)');
    expect(doc.querySelector('#first path')?.getAttribute('d')).toBe('M5 7L40 15Z');
    expect(doc.querySelector('#first path')?.getAttribute('clip-path')).toBe('url(#first-0)');
    expect(doc.querySelector('#second path')?.getAttribute('clip-path')).toBe('url(#second-0)');
    expect(doc.querySelector('#second-0')).not.toBeNull();
    expect(doc.querySelector('#first path')?.getAttribute('fill')).toBe('#D7CDF580');
  });

  it('recolors Figma paint slots and preserves alpha', () => {
    const asset = parseSvg(entry, fixture);
    const expected = renderAsset(asset, 'test', assetPalette(asset, schemes[1]));
    expect(expected).toContain('fill="#fdd7b980"');
    expect(expected).toContain('stroke="#80dada"');
    expect(asset.root.querySelector('path')?.getAttribute('fill')).toBe('#D7CDF580');
  });

  it.each([
    '<script/>', '<image href="#pixel"/>', '<use href="https://example.com/asset.svg"/>',
    '<path onload="run()"/>', '<rect fill="url(https://example.com/red.svg)"/>',
    '<rect style="fill:url(\\65 xample)"/>', '<rect fill="url(#missing)"/>',
  ])('rejects unsupported or unresolved SVG content (%s)', (body) => {
    expect(() => parseSvg(entry, start + body + '</svg>')).toThrow();
  });
});

describe('size variants and palette', () => {
  it('switches detail variants and adjusts geometry relative to the artboard', () => {
    const detailed = parseSvg(entry, fixture);
    const simple = parseSvg({ ...entry, detail: 'simple' }, fixture.replace('4 6 60 20', '2 3 30 10'));
    const assets = [detailed, simple];
    const before = { ...formats[0], background: 'transparent' };
    const after = { ...formats[1], background: 'transparent' };
    const layer = placeAsset(detailed, before);
    const compact = visibleAssets(assets, after.detail);
    expect(compact.get(entry.id)).toBe(simple);
    expect(resizeLayers([layer], before, after, visibleAssets(assets, before.detail), compact)).toEqual([
      { ...layer, x: layer.x / 2, y: layer.y / 2 },
    ]);
  });

  it('validates separate palettes for backgrounds and objects', () => {
    expect(parseScheme(JSON.stringify(schemes[2]))).toEqual(schemes[2]);
    expect(() => parseScheme('{"background":["#123456"]}')).toThrow();
    const asset = parseSvg({ ...entry, role: 'background' }, fixture);
    const paints = assetPalette(asset, schemes[2]);
    expect(paints.get('#d7cdf5')).toBe(schemes[2].background[0]);
    expect([...paints.values()].every((paint) => schemes[2].background.includes(paint))).toBe(true);
  });
});
