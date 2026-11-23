const assert = require('node:assert/strict');
const { test } = require('node:test');
const { OpenAiClient } = require('../dist/modules/composition/clients/open-ai.client');
const { readCompositionRequest } = require('../dist/modules/composition/dto/select-composition.dto');
const { CompositionService } = require('../dist/modules/composition/services/composition.service');

const candidates = [
  { id: 'book-main', componentId: 'book', name: 'Раскрытая книга', role: 'main', tags: ['книга', 'учёба', 'знания'] },
  { id: 'book-background', componentId: 'book', name: 'Раскрытая книга', role: 'background', tags: ['книга', 'учёба', 'знания'] },
  { id: 'lamp-main', componentId: 'lamp', name: 'Настольная лампа', role: 'main', tags: ['лампа', 'идея', 'свет'] },
];
const catalog = { listCandidates: async (_detail, ids) => candidates.filter((item) => !ids || ids.includes(item.id)) };
const local = new CompositionService({ select: async () => undefined }, catalog);

test('selects explicit names and backgrounds in order and reports unresolved names', async () => {
  const input = readCompositionRequest({ mode: 'names', text: 'КНИГА, книга (фон); лампа\nкомпас', candidates });
  assert.deepEqual(await local.select(input), {
    ids: ['book-main', 'book-background', 'lamp-main'],
    unmatched: ['компас'],
    method: 'names',
  });
});

test('looks up title keywords and returns only distinct objects from the library', async () => {
  const input = readCompositionRequest({ mode: 'metaphor', text: 'Учеба и свет знаний', candidates });
  const selection = await local.select(input);
  assert.equal(selection.method, 'keywords');
  assert.deepEqual(new Set(selection.ids), new Set(['book-main', 'lamp-main']));
});

test('leaves unrelated titles unmatched', async () => {
  const input = readCompositionRequest({ mode: 'metaphor', text: 'Лыжи в горах', candidates });
  assert.deepEqual((await local.select(input)).ids, []);
});

test('validates ID uniqueness, text and mode before asking any provider', () => {
  assert.throws(() => readCompositionRequest({ mode: 'names', text: 'книга', candidates: [candidates[0], candidates[0]] }));
  assert.throws(() => readCompositionRequest({ mode: 'draw', text: 'книга', candidates }));
  assert.throws(() => readCompositionRequest({ mode: 'names', text: '  ', candidates }));
});

test('constrains model output to the catalog and falls back when an unknown ID is returned', async (context) => {
  const book = { id: 'book', role: 'main', relativeTo: null, dx: 0, dy: 0, rotation: -8, depth: 2 };
  const lamp = { id: 'lamp', role: 'main', relativeTo: 'book', dx: -.6, dy: -.7, rotation: 5, depth: 1 };
  const body = { layers: [book, lamp] };
  context.mock.method(globalThis, 'fetch', async (_url, request) => {
    const input = JSON.parse(request.body);
    if (input.tool_choice.type === 'function') {
      assert.equal(input.tools[0].name, 'list_catalog');
      return Response.json({ output: [{ type: 'function_call', name: 'list_catalog', arguments: '{}', call_id: 'call-1' }] });
    }
    const result = input.input.at(-1);
    assert.equal(result.type, 'function_call_output');
    assert.equal(result.call_id, 'call-1');
    const toolResult = JSON.parse(result.output);
    assert.deepEqual((toolResult.catalog ?? toolResult).map(({ id, roles }) => ({ id, roles })), [
      { id: 'book', roles: ['main', 'background'] }, { id: 'lamp', roles: ['main'] },
    ]);
    assert.deepEqual(input.text.format.schema.properties.layers.items.properties.id.enum, ['book', 'lamp']);
    assert.equal(input.store, false);
    return new Response(JSON.stringify({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(body) }] }],
    }));
  });
  const service = new CompositionService(new OpenAiClient({ openAiApiKey: 'test-key', openAiModel: 'test-model' }), catalog);
  const input = readCompositionRequest({ mode: 'metaphor', text: 'свет', detail: 'simple' });
  const first = await service.select(input);
  assert.equal(first.method, 'ai');
  assert.deepEqual(first.ids, ['book-main', 'lamp-main']);
  book.role = 'background';
  assert.deepEqual((await service.select(input)).placements, [
    { assetId: 'book-background', relativeTo: null, dx: 0, dy: 0, rotation: -8, depth: 2 },
    { assetId: 'lamp-main', relativeTo: 'book-background', dx: -.6, dy: -.7, rotation: 5, depth: 1 },
  ]);
  const { schemes } = require('../dist/common/svg/palette');
  const styled = readCompositionRequest({ ...input, colorOptions: {
    palettes: schemes, paints: { 'book-background': [0, 2], 'lamp-main': [3, 4, 7] },
  } });
  Object.assign(body, { schemeIndex: 2, background: 1 });
  book.paintChanges = [{ from: 0, to: 5 }, { from: 2, to: 3 }];
  lamp.paintChanges = [{ from: 4, to: 6 }, { from: 0, to: 7 }, { from: 7, to: 3 }];
  const colored = await service.select(styled);
  assert.deepEqual(colored.colors, { schemeIndex: 2, background: 1 });
  assert.deepEqual(colored.placements.map(p => p.paintChanges), [[{ from: 2, to: 3 }], [{ from: 4, to: 6 }]]);
  book.paintChanges = [{ from: 0, to: 2 }];
  assert.deepEqual((await service.select(styled)).placements[0].paintChanges, []);
  body.background = 7;
  const invalidCanvas = await service.select(styled);
  assert.equal(invalidCanvas.method, 'ai');
  assert.equal(invalidCanvas.colors, undefined);
  assert.equal(invalidCanvas.placements[0].paintChanges, undefined);
  for (const invalid of [{ id: 'invented' }, { relativeTo: 'lamp' }, { dx: 2 }, { id: 'book' }, { depth: 8 }]) {
    body.layers = [book, { ...lamp, ...invalid }];
    assert.deepEqual(await service.select(input), { method: 'keywords', ids: ['lamp-main'], unmatched: [] });
  }
});

test('busy work pairs documents with a writing tool in both catalog sizes without OpenAI', async () => {
  const manifest = require('../../assets/catalog.json');
  for (const detail of ['simple', 'detailed']) {
    const library = { listCandidates: async (size) => manifest.filter(row => row.detail === size) };
    const service = new CompositionService({ select: async () => undefined }, library);
    const result = await service.select({ mode: 'metaphor', text: 'Работа кипит!', detail });
    assert.deepEqual(new Set(result.ids.slice(0, 2)), new Set(['pencil-main', 'folder-main']));
  }
});

test('client-supplied names and unknown objects cannot enter the official selection', async () => {
  const input = readCompositionRequest({ mode: 'names', text: 'логотип, книга', candidates: [
    { ...candidates[0], name: 'логотип', tags: ['логотип'] },
    { ...candidates[0], id: 'fake', name: 'логотип' },
  ] });
  assert.deepEqual(await local.select(input), { ids: ['book-main'], unmatched: ['логотип'], method: 'names' });
  assert.throws(() => readCompositionRequest({ mode: 'names', text: 'книга', detail: 'invalid' }));
});

test('builds a workspace scene with an unavailable provider and respects an explicit single-object AI plan', async () => {
  const library = { listCandidates: async () => [
    { ...candidates[2], tags: ['работа', 'лампа'] },
    { id: 'folder', name: 'Папка', tags: ['документ'], role: 'main' },
    { id: 'pen', name: 'Ручка', tags: ['письмо'], role: 'main' },
    { id: 'coin', name: 'Монета', tags: ['монета'], role: 'main' },
  ] };
  const fallback = new CompositionService({ select: async () => undefined }, library);
  const result = await fallback.select({ mode: 'metaphor', text: 'Мой рабочий стол', detail: 'simple' });
  assert.deepEqual(new Set(result.ids), new Set(['lamp-main', 'folder', 'pen']));
  const plan = { placements: [{ assetId: 'lamp-main', relativeTo: null, dx: 0, dy: 0, rotation: 5 }],
    colors: { schemeIndex: 1, background: 2 } };
  const ai = new CompositionService({ select: async () => plan }, library);
  assert.deepEqual(await ai.select({ mode: 'metaphor', text: 'Рабочий стол, только лампа', detail: 'simple' }),
    { ...plan, method: 'ai', ids: ['lamp-main'], unmatched: [] });
});

/* Quota coverage is suspended with the quota service.
test('reserves quota before the first paid call and skips it for free selections', async (context) => {
  const quotaError = Object.assign(new Error('quota'), { status: 429 });
  const reserve = context.mock.fn(async () => { throw quotaError; });
  const fetch = context.mock.method(globalThis, 'fetch', () => assert.fail('unexpected paid request'));
  const config = { openAiApiKey: 'test-key' };
  const service = new CompositionService(new OpenAiClient(config, { reserve }), catalog);
  const request = { mode: 'metaphor', text: 'Свет', detail: 'simple' };
  await assert.rejects(service.select(request), error => error === quotaError);
  assert.equal((await service.select({ ...request, mode: 'names', text: 'лампа' })).method, 'names');
  config.openAiApiKey = '';
  assert.equal((await service.select(request)).method, 'keywords');
  assert.equal(reserve.mock.callCount(), 1);
  assert.equal(fetch.mock.callCount(), 0);
});
*/
