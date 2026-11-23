// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Draft, PersonalAsset } from './draft';
import { useDraftAutosave } from './useDraftAutosave';

it('coalesces drag changes, flushes on pagehide and saves the final position on release', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const store = { save: vi.fn().mockResolvedValue(undefined) };
  const files: PersonalAsset[] = [];
  const draft: Draft = { layers: [], personalIds: [], selectedId: null, formatIndex: 0, paletteList: [],
    schemeIndex: -1, background: 'transparent', query: '', mode: 'names', prompt: '', proposal: null };
  const layer = { id: '1', assetId: 'lamp', rotation: 0, scale: 1, x: 0, y: 0 };
  function Probe({ snapshot, dragging }: { snapshot: Draft; dragging: boolean }) {
    useDraftAutosave(store, snapshot, files, dragging, '');
    return null;
  }
  const render = (snapshot: Draft, dragging: boolean) => act(async () => {
    root.render(<Probe snapshot={snapshot} dragging={dragging} />);
  });
  try {
    await render(draft, false);
    const first = { ...draft, layers: [{ ...layer, x: 10 }] };
    const second = { ...draft, layers: [{ ...layer, x: 20 }] };
    await render(first, true);
    await render(second, true);
    expect(store.save).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    expect(store.save).toHaveBeenCalledExactlyOnceWith(second, files);
    const final = { ...draft, layers: [{ ...layer, x: 30 }] };
    await render(final, true);
    await render(final, false);
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenLastCalledWith(final, files);
    await render(final, false);
    expect(store.save).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
