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
