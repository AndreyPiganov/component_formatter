// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import App from './App';
import { loadLibrary, selectObjects } from './api';
import { parseSvg } from './svg';

vi.mock('./api', () => ({ loadLibrary: vi.fn(), selectObjects: vi.fn() }));

it.each([false, true])('keeps manual edits until the user chooses the pending composition (apply=%s)', async (apply) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const asset = parseSvg({ id: 'book-main', name: 'Книга', role: 'main', source: 'Figma', tags: [], detail: 'any' },
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5"><rect width="5" height="5"/></svg>');
  vi.mocked(loadLibrary).mockResolvedValue({ assets: [asset], skipped: 0 });
  let resolveSelection!: (selection: Awaited<ReturnType<typeof selectObjects>>) => void;
  const delayed = new Promise<Awaited<ReturnType<typeof selectObjects>>>((resolve) => { resolveSelection = resolve; });
  vi.mocked(selectObjects).mockReturnValue(delayed);
  try {
    await act(async () => root.render(<App />));
    const input = container.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'книга');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true })); });
    await act(async () => { container.querySelector<HTMLButtonElement>('.asset-card')!.click(); });
    await act(async () => { resolveSelection({ ids: [asset.id, asset.id], method: 'names', unmatched: [] }); });
    const layerCount = () => container.querySelectorAll('g[data-layer]').length;
    expect(layerCount()).toBe(1);
    const label = apply ? 'Заменить сцену' : 'Оставить мою';
    await act(async () => { Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label)!.click(); });
    expect(layerCount()).toBe(apply ? 2 : 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it('restores the scene before catalog loading and keeps the first save for a user edit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const asset = parseSvg({ id: 'book-main', name: 'Книга', source: 'Figma', role: 'main', detail: 'any', tags: [] },
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5"><rect width="5" height="5"/></svg>');
  let finish!: (library: Awaited<ReturnType<typeof loadLibrary>>) => void;
  vi.mocked(loadLibrary).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const save = vi.fn().mockResolvedValue(undefined);
  const draft = {
    layers: [{ id: 'layer-1', assetId: asset.id, x: 80, y: 20, rotation: 35, scale: 1 }],
    selectedId: 'layer-1', personalIds: [], paletteList: [], schemeIndex: -1, background: 'transparent' as const,
    mode: 'names' as const, formatIndex: 1, query: '', prompt: 'Книга', proposal: null,
  };
  try {
    await act(async () => root.render(<App store={{ save }} draft={draft} />));
    const download = container.querySelector<HTMLButtonElement>('header button')!;
    expect(download.disabled).toBe(true);
    expect(container.querySelector('textarea')?.value).toBe('Книга');
    await act(async () => finish({ assets: [asset], skipped: 0 }));
    expect(download.disabled).toBe(false);
    expect(save).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Дублировать слой"]')!.click());
    const [snapshot] = save.mock.lastCall!;
    expect(snapshot.layers).toHaveLength(2);
    expect(snapshot.layers[1].rotation).toBe(35);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
