import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Draft, DraftStore, PersonalAsset } from './draft';

export function useDraftAutosave(store: Pick<DraftStore, 'save'> | undefined, snapshot: Draft,
  imported: PersonalAsset[], dragging: boolean, initialError: string) {
  const [error, setError] = useState(initialError);
  const previous = useRef(snapshot);
  const pending = useRef<{ draft: Draft; files: PersonalAsset[] } | null>(null);
  const latestWrite = useRef(0);

  const flush = useCallback(async () => {
    const data = pending.current;
    if (!store || !data) return;
    pending.current = null;
    const write = ++latestWrite.current;
    try {
      await store.save(data.draft, data.files);
      if (write === latestWrite.current) setError('');
    } catch {
      if (write === latestWrite.current) {
        pending.current ??= data;
        setError('Браузер не сохранил последние изменения. Можно скачать SVG.');
      }
    }
  }, [store]);

  useLayoutEffect(() => {
    if (previous.current !== snapshot) {
      previous.current = snapshot;
      pending.current = { draft: snapshot, files: imported };
    }
    if (!dragging) void flush();
  }, [snapshot, imported, dragging, flush]);

  useLayoutEffect(() => {
    const savePending = () => { void flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') savePending(); };
    window.addEventListener('pagehide', savePending);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', savePending);
      document.removeEventListener('visibilitychange', onVisibility);
      savePending();
    };
  }, [flush]);

  return error;
}
