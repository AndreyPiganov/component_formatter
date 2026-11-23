import { useRef, type ChangeEvent } from 'react';
import { Grid2X2, Plus, Search, Upload } from 'lucide-react';
import { maxSvgBytes, newId, parseSvg, type SvgAsset } from '../model/svg';
import type { PersonalAsset } from '../storage/draft';

interface LibraryPanelProps {
  available: ReadonlyMap<string, SvgAsset>;
  personalIds: ReadonlySet<string>;
  libraryStatus: string;
  query: string;
  setQuery: (value: string) => void;
  addObject: (asset: SvgAsset) => void;
  onImport: (assets: PersonalAsset[]) => void;
  setStatus: (message: string) => void;
}

export function LibraryPanel({ available, personalIds, libraryStatus, query, setQuery, addObject, onImport, setStatus }: LibraryPanelProps) {
  const libraryUpload = useRef<HTMLInputElement>(null);
  const filtered = [...available.values()].filter((asset) => {
    const item = [asset.name, asset.source, ...asset.tags].join(' ').toLocaleLowerCase('ru');
    return item.includes(query.trim().toLocaleLowerCase('ru'));
  });

  async function importAssets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const loaded: PersonalAsset[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (file.size > maxSvgBytes) throw new Error('Максимальный размер SVG — 1 МБ.');
        const name = file.name.replace(/\.svg$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 160) || 'Объект';
        const markup = await file.text();
        loaded.push({ ...parseSvg({
          id: 'local:' + newId(), name, source: 'Импорт SVG', tags: [], detail: 'any', role: 'main',
        }, markup), markup });
      } catch (error) {
        errors.push(file.name + ' · ' + (error as Error).message);
      }
    }
    onImport(loaded);
    setStatus('Импортировано SVG: ' + loaded.length + '. ' + errors.slice(0, 3).join(' '));
  }

  return <aside className="panel library" aria-label="Библиотека">
    <div className="panel-title">
      <h2><Grid2X2 size={17} /> Библиотека</h2>
      <button className="button secondary" aria-label="Загрузить свой SVG" title="Загрузить свой SVG"
        onClick={() => libraryUpload.current?.click()}><Upload size={16} /> Свой SVG</button>
      <input type="file" accept=".svg,image/svg+xml" multiple hidden ref={libraryUpload} onChange={importAssets} />
    </div>
    <label className="search">
      <Search size={16} />
      <input placeholder="Найти объект" aria-label="Найти объект" value={query}
        onChange={(event) => setQuery(event.target.value)} />
    </label>
    {libraryStatus && <p className="muted" role="status">{libraryStatus}</p>}
    {available.size === 0 && <div className="library-empty">
      <p>Загрузите SVG-компоненты, чтобы собрать композицию.</p>
      <button className="button secondary" onClick={() => libraryUpload.current?.click()}>
        <Plus size={16} /> Загрузить SVG
      </button>
    </div>}
    {available.size > 0 && filtered.length === 0 && <p className="muted">Объекты не найдены.</p>}
    {(['main', 'background', 'personal'] as const).map((role) => {
      const items = filtered.filter((asset) => personalIds.has(asset.id) ? role === 'personal' : asset.role === role);
      return items.length > 0 && <section className="asset-section" key={role}>
        <h3>{role === 'personal' ? 'Мои SVG' : role === 'main' ? 'Главные объекты' : 'Фоновые объекты'}</h3>
        <div className="asset-grid">
          {items.map((asset) => <button className="asset-card" key={asset.id} onClick={() => addObject(asset)}
            title={'Добавить «' + asset.name + '» · ' + asset.source}>
            <img src={asset.thumbnail} alt="" loading="lazy" />
            <span>{asset.name}</span>
          </button>)}
        </div>
      </section>;
    })}
  </aside>;
}
