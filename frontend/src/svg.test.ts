// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { assetPalette, parseScheme, schemes } from './palette';
import { arrangeObjects, assetsForLayers, formats, placeAsset, referenceSizedAssets, resizeLayers, scaleComposition, visibleAssets } from './scene';
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

  it('exports rotation and both mirror axes around the layer center without changing source paths', () => {
    const asset = parseSvg(entry, fixture);
    const board = { ...formats[0], background: 'transparent' };
    const layer = { ...placeAsset(asset, board), x: 220, y: 180, rotation: 72, scale: .5, flipX: true };
    for (const flipY of [false, true]) {
      const svg = exportSvg(board, [{ ...layer, flipY }], new Map([[asset.id, asset]]), new Map());
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(xml.querySelector('g')?.getAttribute('transform')).toBe(
        'translate(220 180) rotate(72) scale(-0.5 ' + (flipY ? '-0.5' : '0.5') + ')');
      expect(xml.querySelector('path')?.getAttribute('d')).toBe('M5 7L40 15Z');
    }
  });

  it('recolors Figma paint slots and preserves alpha', () => {
    const asset = parseSvg(entry, fixture);
    const expected = renderAsset(asset, 'test', assetPalette(asset, schemes[1]));
    expect(expected).toContain('fill="#fdd7b980"');
    expect(expected).toContain('stroke="#80dada"');
    expect(asset.root.querySelector('path')?.getAttribute('fill')).toBe('#D7CDF580');
  });

  it('exports separate recolor choices for duplicates and follows the active scheme', () => {
    const asset = parseSvg(entry, fixture);
    const artboard = { ...formats[0], background: 'transparent' };
    const first = { ...placeAsset(asset, artboard), id: 'first', colorSlots: { '#d7cdf5': '#f9a3aa' } };
    const second = { ...first, id: 'second', colorSlots: undefined };
    for (const scheme of [schemes[1], schemes[2], undefined]) {
      const svg = exportSvg(artboard, [first, second], new Map([[asset.id, asset]]),
        new Map([[asset.id, assetPalette(asset, scheme)]]));
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(xml.querySelector('#first path')?.getAttribute('fill')?.toLowerCase())
        .toBe((scheme?.objects[1] ?? '#d7cdf5') + '80');
      expect(xml.querySelector('#second path')?.getAttribute('fill')?.toLowerCase())
        .toBe((scheme?.background[0] ?? '#d7cdf5') + '80');
    }
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
    expect(resizeLayers([layer], before, after)).toEqual([
      { ...layer, x: layer.x / 2, y: layer.y / 2, scale: layer.scale / 2 },
    ]);
  });

  it('prefers exact detail in either catalog order and retains unavailable artwork only for placed layers', () => {
    const simple = parseSvg({ ...entry, detail: 'simple' }, fixture);
    const generic = { ...simple, detail: 'any' as const };
    for (const assets of [[simple, generic], [generic, simple]]) {
      expect(visibleAssets(assets, 'simple').get(entry.id)).toBe(simple);
      expect(visibleAssets(assets, 'detailed').get(entry.id)).toBe(generic);
    }
    const before = { ...formats[1], background: 'transparent' };
    const after = { ...formats[0], background: 'transparent' };
    const layer = placeAsset(simple, before);
    const available = visibleAssets([simple], 'detailed');
    expect(available.size).toBe(0);
    const resolved = assetsForLayers([simple], available);
    const resized = resizeLayers([layer], before, after);
    expect(resized[0]).toEqual({ ...layer, x: layer.x * 2, y: layer.y * 2, scale: layer.scale * 2 });
    expect(exportSvg(after, resized, resolved, new Map())).toContain('M5 7L40 15Z');
  });

  it('uses one scene scale for differently sized subjects across roles and detail levels', () => {
    const book = { ...parseSvg(entry, fixture), componentId: 'book' };
    const small = { ...book, id: 'coin', componentId: 'coin', width: 12, height: 12 };
    const compactCoin = { ...small, id: 'coin-bg', role: 'background' as const, detail: 'simple' as const, width: 5, height: 6 };
    const [variant] = referenceSizedAssets([compactCoin, small, book]);
    expect([variant.width, variant.height]).toEqual([10, 12]);
    const board = { ...formats[0], background: 'transparent' };
    const scene = arrangeObjects([book, small], board);
    expect(scene[0].scale).toBe(scene[1].scale);
    const resized = scaleComposition(scene, 2, scene[0]);
    expect(resized[1].x - resized[0].x).toBeCloseTo((scene[1].x - scene[0].x) * 2);
    expect(resized[1].scale).toBe(resized[0].scale);
    const xml = new DOMParser().parseFromString(renderAsset(variant, 'test', new Map()), 'image/svg+xml');
    expect(xml.documentElement.getAttribute('width')).toBe('10');
    expect(xml.documentElement.getAttribute('viewBox')).toBe('4 6 60 20');
  });

  it('validates separate palettes for backgrounds and objects', () => {
    expect(parseScheme(JSON.stringify(schemes[2]))).toEqual(schemes[2]);
    expect(() => parseScheme('{"background":["#123456"]}')).toThrow();
    const asset = parseSvg({ ...entry, role: 'background' }, fixture);
    const paints = assetPalette(asset, schemes[2]);
    expect(paints.get('#d7cdf5')).toBe(schemes[2].background[0]);
    expect([...paints.values()].every((paint) => schemes[2].background.includes(paint))).toBe(true);
  });

  it('places background objects behind the main subject and fits each object inside the frame', () => {
    const main = parseSvg(entry, fixture);
    const background = parseSvg({ ...entry, id: 'book-bg', role: 'background' }, fixture);
    const artboard = { ...formats[2], background: 'transparent' };
    const scene = arrangeObjects([main, background, main], artboard);
    expect(scene.map((layer) => layer.assetId)).toEqual([background.id, main.id, main.id]);
    expect(new Set(scene.map((layer) => layer.id)).size).toBe(3);
    for (const { x, y, scale } of scene) {
      expect(x - main.width * scale / 2).toBeGreaterThan(0);
      expect(y - main.height * scale / 2).toBeGreaterThan(0);
      expect(x + main.width * scale / 2).toBeLessThan(artboard.width);
      expect(y + main.height * scale / 2).toBeLessThan(artboard.height);
    }
  });

  it.each(formats)('preserves planned contact, rotations and depth at $name', (format) => {
    const book = parseSvg(entry, fixture);
    const pen = { ...book, id: 'pen', width: 15, height: 4 };
    const lamp = { ...book, id: 'lamp', role: 'background' as const, width: 30, height: 55 };
    const scene = arrangeObjects([book, pen, lamp], { ...format, background: 'transparent' }, [
      { assetId: book.id, relativeTo: null, dx: 0, dy: 0, rotation: 0 },
      { assetId: pen.id, relativeTo: book.id, dx: .5, dy: 0, rotation: 90 },
      { assetId: lamp.id, relativeTo: book.id, dx: -.7, dy: -.6, rotation: -8 },
    ]);
    const [back, page, tool] = scene;
    expect(scene.map(l => l.assetId)).toEqual(['lamp', 'book', 'pen']);
    expect(back.rotation).toBe(-8);
    expect(tool.rotation).toBe(90);
    expect(tool.scale).toBe(page.scale);
    expect(tool.x - page.x).toBeCloseTo(.5 * (book.width + pen.height) / 2 * page.scale);
    expect(tool.y).toBe(page.y);
    expect(back.y).toBeLessThan(page.y);
    expect(back.x).toBeLessThan(page.x);
  });

  it('exposes part of a small background object hidden behind the subject', () => {
    const wallet = parseSvg(entry, fixture);
    const coin = { ...wallet, id: 'coin', role: 'background' as const, width: 8, height: 8 };
    const [back, front] = arrangeObjects([wallet, coin], { ...formats[0], background: 'transparent' }, [
      { assetId: wallet.id, relativeTo: null, dx: 0, dy: 0, rotation: 0 },
      { assetId: coin.id, relativeTo: wallet.id, dx: 0, dy: -.25, rotation: 0 },
    ]);
    expect(back.assetId).toBe('coin');
    expect(back.y).toBeCloseTo(front.y - wallet.height * front.scale / 2);
    expect(back.x).toBeCloseTo(front.x);
  });

  it('brings diagonal contact inside the transparent corners of isometric artwork', () => {
    const phone = parseSvg(entry, fixture);
    const coin = { ...phone, id: 'coin', width: 8, height: 8 };
    const [base, token] = arrangeObjects([phone, coin], { ...formats[0], background: 'transparent' }, [
      { assetId: phone.id, relativeTo: null, dx: 0, dy: 0, rotation: 0 },
      { assetId: coin.id, relativeTo: phone.id, dx: .6, dy: -.6, rotation: 0 },
    ]);
    expect(token.x - base.x).toBeCloseTo((phone.width + coin.width) * .15 * base.scale);
    expect(base.y - token.y).toBeCloseTo((phone.height + coin.height) * .15 * base.scale);
  });

  it('can tuck a colored coin behind the wallet it is positioned against', () => {
    const wallet = parseSvg(entry, fixture);
    const coin = { ...wallet, id: 'coin', width: 8, height: 8 };
    const layers = arrangeObjects([wallet, coin], { ...formats[0], background: 'transparent' }, [
      { assetId: wallet.id, relativeTo: null, dx: 0, dy: 0, rotation: 0, depth: 2 },
      { assetId: coin.id, relativeTo: wallet.id, dx: .85, dy: 0, rotation: 12, depth: 1 },
    ]);
    expect(layers.map(layer => layer.assetId)).toEqual([coin.id, wallet.id]);
    expect(layers[0].x).toBeGreaterThan(layers[1].x);
  });
});
