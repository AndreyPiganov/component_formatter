const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AppConfigService } = require('../dist/config/app-config.service');
const { OpenAiClient } = require('../dist/modules/composition/clients/open-ai.client');
const { readCompositionRequest } = require('../dist/modules/composition/dto/select-composition.dto');
const { CompositionService } = require('../dist/modules/composition/services/composition.service');

const candidates = [
  { id: 'book-main', name: 'Раскрытая книга', role: 'main', tags: ['книга', 'учёба', 'знания'] },
  { id: 'book-background', name: 'Раскрытая книга', role: 'background', tags: ['книга', 'учёба'] },
  { id: 'lamp-main', name: 'Настольная лампа', role: 'main', tags: ['лампа', 'идея', 'свет'] },
];
const local = new CompositionService({ select: async () => undefined });

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
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
  const body = { ids: ['book-main'] };
  context.mock.method(globalThis, 'fetch', async (_url, request) => {
    const input = JSON.parse(request.body);
    assert.deepEqual(input.text.format.schema.properties.ids.items.enum, candidates.map(({ id }) => id));
    assert.equal(input.store, false);
    return new Response(JSON.stringify({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(body) }] }],
    }));
  });
  const service = new CompositionService(new OpenAiClient(new AppConfigService()));
  const input = { mode: 'metaphor', text: 'свет', candidates };
  assert.deepEqual(await service.select(input), { method: 'ai', ids: ['book-main'], unmatched: [] });
  body.ids = ['invented'];
  assert.deepEqual(await service.select(input), { method: 'keywords', ids: ['lamp-main'], unmatched: [] });
});
