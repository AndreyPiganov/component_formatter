const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FileCatalogSource } = require('../dist/modules/library/sources/file-catalog.source');
const { LibraryService } = require('../dist/modules/library/services/library.service');
const { validateCatalogSvg } = require('../dist/modules/library/sources/validate-catalog-svg');

const valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0Z"/></svg>';

test('rejects malformed XML, unsupported artwork, missing definitions and invalid viewports', () => {
  for (const invalid of ['<svg', valid + valid, valid.replace('viewBox', 'data-size'),
    valid.replace('<path', '<image'), valid.replace('<path', '<path fill="url(#missing)"')]) {
    assert.throws(() => validateCatalogSvg(invalid));
  }
  validateCatalogSvg(valid);
});

test('a broken SVG cannot replace the stored variant or prune the catalog', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'svg-catalog-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const row = { id: 'book-main', detail: 'simple', role: 'main', name: 'Книга', source: 'Figma', tags: [] };
  const manifest = [{ ...row, file: 'book.svg' }, { ...row, id: 'lamp-main', file: 'lamp.svg' }];
  await fs.writeFile(path.join(dir, 'catalog.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(dir, 'book.svg'), '<svg');
  await fs.writeFile(path.join(dir, 'lamp.svg'), valid);
  const sync = t.mock.fn();
  const service = new LibraryService({ syncCatalog: sync }, new FileCatalogSource({ assetsDir: dir }));
  await service.onModuleInit();
  assert.equal(sync.mock.callCount(), 1);
  const [updates, complete] = sync.mock.calls[0].arguments;
  assert.deepEqual(updates.map(({ id }) => id), ['lamp-main']);
  assert.equal(complete, false);
});
