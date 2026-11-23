import { parseSvg, type CatalogEntry, type Layer, type SvgAsset } from '../model/svg';
import type { Scheme } from '../model/palette';
import type { CompositionMode } from '../api/editor';

export interface PersonalAsset extends SvgAsset { markup: string }
interface StoredSvg { entry: CatalogEntry; markup: string }

export interface Draft {
  layers: Layer[];
  personalIds: string[];
  selectedId: string | null;
  selectedIds?: string[];
  formatIndex: number;
  paletteList: Scheme[];
  schemeIndex: number;
  background: number | 'transparent';
  query: string;
  mode: CompositionMode;
  prompt: string;
  proposal: { layers: Layer[]; message: string; colors?: { schemeIndex: number; background: number | 'transparent' } } | null;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class DraftStore {
  private readonly storedIds = new Set<string>();
  constructor(private readonly db: IDBDatabase) {}

  async read() {
    const tx = this.db.transaction(['scenes', 'files']);
    const [draft, files] = await Promise.all([
      result<Draft | undefined>(tx.objectStore('scenes').get('current')),
      result<StoredSvg[]>(tx.objectStore('files').getAll()),
    ]);
    const byId = new Map(files.map((file) => [file.entry.id, file]));
    const imported = (draft?.personalIds ?? []).map((id) => {
      const file = byId.get(id);
      if (!file) throw new Error('Файл черновика недоступен.');
      this.storedIds.add(id);
      return { ...parseSvg(file.entry, file.markup), markup: file.markup };
    });
    return { draft, imported };
  }

  save(draft: Draft, imported: PersonalAsset[]) {
    const added = imported.filter((asset) => !this.storedIds.has(asset.id));
    const tx = this.db.transaction(added.length ? ['scenes', 'files'] : ['scenes'], 'readwrite');
    for (const { id, name, role, detail, source, tags, markup } of added) {
      tx.objectStore('files').put({ entry: { id, name, role, detail, source, tags }, markup }, id);
    }
    tx.objectStore('scenes').put(draft, 'current');
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        for (const asset of added) this.storedIds.add(asset.id);
        resolve();
      };
      tx.onabort = () => reject(tx.error ?? new Error('Запись черновика прервана.'));
    });
  }
}

export async function openDraft() {
  const request = indexedDB.open('component-formatter', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('scenes');
    request.result.createObjectStore('files');
  };
  const db = await result(request);
  db.onversionchange = () => db.close();
  const store = new DraftStore(db);
  return { store, ...await store.read() };
}
