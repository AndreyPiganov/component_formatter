import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowDown, ArrowUp, Copy, Download, Grid2X2, Layers, Palette, Plus,
  Search, Sparkles, Trash2, Upload,
} from 'lucide-react';
import { loadLibrary, selectObjects, type CompositionMode } from './api';
import { Canvas } from './Canvas';
import { assetPalette, parseScheme, schemes, type Scheme } from './palette';
import { arrangeObjects, assetsForLayers, formats, placeAsset, resizeLayers, visibleAssets } from './scene';
import { exportSvg, maxSvgBytes, newId, parseSvg, type Layer, type SvgAsset } from './svg';

type Background = number | 'transparent';

function saveFile(svg: string, personal: boolean) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.download = personal ? 'personal-composition.svg' : 'composition.svg';
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [sourceAssets, setSourceAssets] = useState<SvgAsset[]>([]);
  const [imported, setImported] = useState<SvgAsset[]>([]);
  const [libraryStatus, setLibraryStatus] = useState('Загрузка библиотеки…');
  const [layers, updateLayers] = useState<Layer[]>([]);
  const revision = useRef(0);
  const [proposal, setProposal] = useState<{ layers: Layer[]; message: string } | null>(null);

  function setLayers(update: Layer[] | ((current: Layer[]) => Layer[])) {
    revision.current++;
    updateLayers(update);
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formatIndex, setFormatIndex] = useState(0);
  const [paletteList, setPaletteList] = useState<Scheme[]>(schemes);
  const [schemeIndex, setSchemeIndex] = useState(0);
  const [background, setBackground] = useState<Background>(0);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<CompositionMode>('metaphor');
  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState('');
  const libraryUpload = useRef<HTMLInputElement>(null);
  const paletteUpload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const request = new AbortController();
    loadLibrary(request.signal).then((library) => {
      if (request.signal.aborted) return;
      setSourceAssets(library.assets);
      setLibraryStatus(library.skipped ? 'Пропущено SVG: ' + library.skipped : '');
    }).catch(() => {
      if (!request.signal.aborted) setLibraryStatus('Готовая библиотека недоступна.');
    });
    return () => request.abort();
  }, []);

  const assets = useMemo(() => [...sourceAssets, ...imported], [sourceAssets, imported]);
  const format = formats[formatIndex];
  const scheme = paletteList[schemeIndex];
  const backgroundColors = (scheme ?? schemes[0]).background;
  const artboard = {
    width: format.width, height: format.height,
    background: background === 'transparent' ? 'transparent' : backgroundColors[background],
  };
  const available = useMemo(() => visibleAssets(assets, format.detail), [assets, format.detail]);
  const sceneAssets = useMemo(() => assetsForLayers(assets, available), [assets, available]);
  const retained = [...new Set(layers.filter((layer) => !available.has(layer.assetId))
    .map((layer) => sceneAssets.get(layer.assetId)?.name))];
  const palettes = useMemo(() => new Map([...sceneAssets].map(([id, asset]) =>
    [id, assetPalette(asset, scheme)])), [sceneAssets, scheme]);
  const personalIds = useMemo(() => new Set(imported.map(({ id }) => id)), [imported]);
  const personalScene = layers.some((layer) => personalIds.has(layer.assetId));
  const hasCatalog = [...available.keys()].some((id) => !personalIds.has(id));
  const filtered = [...available.values()].filter((asset) => {
    const item = [asset.name, asset.source, ...asset.tags].join(' ').toLocaleLowerCase('ru');
    return item.includes(query.trim().toLocaleLowerCase('ru'));
  });
  const selected = layers.find((layer) => layer.id === selectedId);
  const selectedAsset = selected && sceneAssets.get(selected.assetId);

  async function importAssets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const loaded: SvgAsset[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (file.size > maxSvgBytes) throw new Error('Максимальный размер SVG — 1 МБ.');
        const name = file.name.replace(/\.svg$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 160) || 'Объект';
        loaded.push(parseSvg({
          id: 'local:' + newId(), name, source: 'Импорт SVG', tags: [], detail: 'any', role: 'main',
        }, await file.text()));
      } catch (error) {
        errors.push(file.name + ' · ' + (error as Error).message);
      }
    }
    setImported((current) => [...current, ...loaded]);
    setStatus('Импортировано SVG: ' + loaded.length + '. ' + errors.slice(0, 3).join(' '));
  }

  async function importPalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 16 * 1024) throw new Error('Максимальный размер палитры — 16 КБ.');
      const custom = parseScheme(await file.text());
      setPaletteList([...paletteList, custom]);
      setSchemeIndex(paletteList.length);
      setStatus('Палитра «' + custom.name + '» применена.');
    } catch (error) {
      setStatus('Ошибка импорта палитры. ' + (error as Error).message);
    }
  }

  function addObject(asset: SvgAsset) {
    const layer = placeAsset(asset, artboard, artboard.width / 2 + (layers.length % 5) * 20,
      artboard.height / 2 + (layers.length % 5) * 20);
    setLayers((current) => [...current, layer]);
    setSelectedId(layer.id);
    setStatus('');
  }

  function patchLayer(id: string, patch: Partial<Layer>) {
    setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
  }

  function deleteLayer(id: string) {
    setLayers((current) => current.filter((layer) => layer.id !== id));
    setSelectedId((current) => current === id ? null : current);
  }

  function duplicateLayer(layer: Layer) {
    const duplicate = { ...layer, id: newId(), x: layer.x + 24, y: layer.y + 24 };
    setLayers((current) => [...current, duplicate]);
    setSelectedId(duplicate.id);
  }

  function reorderLayer(id: string, direction: -1 | 1) {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
      return reordered;
    });
  }

  function changeFormat(index: number) {
    const nextFormat = formats[index];
    if (!nextFormat) return;
    const nextAssets = visibleAssets(assets, nextFormat.detail);
    setLayers((current) => resizeLayers(current, artboard, {
      width: nextFormat.width, height: nextFormat.height, background: artboard.background,
    }, sceneAssets, assetsForLayers(assets, nextAssets)));
    setProposal(null);
    setFormatIndex(index);
  }

  async function compose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (building || !prompt.trim() || !hasCatalog) return;
    const startedAt = revision.current;
    setProposal(null);
    setBuilding(true);
    setStatus('');
    try {
      const selection = await selectObjects(mode, prompt, format.detail);
      const chosen = selection.ids.flatMap((id) => {
        const asset = available.get(id);
        return asset ? [asset] : [];
      });
      if (!chosen.length) {
        setStatus(selection.unmatched.length ? 'Не найдены: ' + selection.unmatched.join(', ') :
          'В библиотеке нет совпадений. Уточните заголовок или укажите названия объектов.');
        return;
      }
      const scene = arrangeObjects(chosen, artboard);
      const method = selection.method === 'ai' ? ' Подбор по смыслу.' :
        selection.method === 'keywords' ? ' Подбор по тегам.' : '';
      const unmatched = selection.unmatched.length ? ' Не добавлены: ' + selection.unmatched.join(', ') + '.' : '';
      const message = 'Добавлено объектов: ' + chosen.length + '.' + method + unmatched;
      if (revision.current === startedAt) {
        setLayers(scene);
        setSelectedId(null);
        setStatus(message);
      } else {
        setProposal({ layers: scene, message });
        setStatus('');
      }
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  return <>
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark"><Grid2X2 size={20} strokeWidth={2.2} /></span>
        <h1>Компоновщик</h1>
      </div>
      <button className="button primary" disabled={!layers.length}
        onClick={() => saveFile(exportSvg(artboard, layers, sceneAssets, palettes), personalScene)}>
        <Download size={16} /> Скачать SVG
      </button>
    </header>

    <main className="layout">
      <aside className="panel library" aria-label="Библиотека">
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
      </aside>

      <section className="work-area" aria-label="Рабочая область">
        <form className="compose-form" onSubmit={compose} aria-label="Автосборка композиции">
          <div className="compose-modes" role="group" aria-label="Способ подбора">
            <button type="button" aria-pressed={mode === 'metaphor'} onClick={() => setMode('metaphor')}>
              <Sparkles size={15} /> По метафоре
            </button>
            <button type="button" aria-pressed={mode === 'names'} onClick={() => setMode('names')}>
              По названиям
            </button>
          </div>
          {imported.length > 0 && <p className="muted">Автоподбор использует исходную библиотеку. Свои SVG можно добавить на холст вручную.</p>}
          <div className="compose-input">
            <textarea rows={2} aria-label={mode === 'metaphor' ? 'Метафора или заголовок' : 'Названия объектов'}
              placeholder={mode === 'metaphor' ? 'Метафора или заголовок' : 'Например: книга, лампа, наушники (фон)'}
              value={prompt} maxLength={400} onChange={(event) => setPrompt(event.target.value)} />
            <button className="button primary" disabled={!hasCatalog || !prompt.trim() || building}>
              {building ? 'Подбираем…' : layers.length ? 'Пересобрать' : 'Собрать'}
            </button>
          </div>
        </form>
        <div className="work-toolbar">
          <h2>Холст</h2>
          <select aria-label="Размер холста" value={formatIndex} disabled={building}
            onChange={(event) => changeFormat(Number(event.target.value))}>
            {formats.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
          </select>
        </div>
        <Canvas artboard={artboard} layers={layers} assets={sceneAssets} palettes={palettes}
          selectedId={selectedId} select={setSelectedId}
          move={(id, x, y) => patchLayer(id, { x, y })} remove={deleteLayer} />
        {personalScene && <p className="status">В композиции есть ваши SVG. Они войдут в экспорт.</p>}
        {retained.length > 0 && <p className="status">Для этого размера нет варианта у объектов
          {' «' + retained.join('», «') + '»'}. На холсте сохранена прежняя детализация.</p>}
        {proposal && <div className="status" role="status">
          Вы изменили сцену во время подбора. Заменить её собранной композицией?
          {' '}<button className="button secondary" onClick={() => {
            setLayers(proposal.layers);
            setSelectedId(null);
            setStatus(proposal.message);
            setProposal(null);
          }}>Заменить сцену</button>
          {' '}<button className="button secondary" onClick={() => setProposal(null)}>Оставить мою</button>
        </div>}
        {status && <output className="status" aria-live="polite">{status}</output>}
      </section>

      <aside className="panel inspector" aria-label="Настройки композиции">
        <section className="inspector-section">
          <div className="panel-title">
            <h2><Palette size={17} /> Палитра</h2>
            <button className="icon-button" aria-label="Загрузить JSON-палитру" title="Загрузить JSON-палитру"
              onClick={() => paletteUpload.current?.click()}><Upload size={16} /></button>
            <input type="file" accept=".json,application/json" hidden ref={paletteUpload} onChange={importPalette} />
          </div>
          <select aria-label="Цветовая схема" value={schemeIndex}
            onChange={(event) => setSchemeIndex(Number(event.target.value))}>
            {paletteList.map((item, index) => <option key={index} value={index}>{item.name}</option>)}
            <option value={-1}>Исходные цвета</option>
          </select>
          <fieldset className="swatches">
            <legend>Цвет холста</legend>
            {backgroundColors.map((color, index) => <button type="button" key={index}
              className="swatch" style={{ backgroundColor: color }}
              aria-label={'Фон ' + color} aria-pressed={background === index}
              onClick={() => setBackground(index)} />)}
            <button type="button" className="swatch checker" aria-label="Прозрачный фон"
              aria-pressed={background === 'transparent'} onClick={() => setBackground('transparent')} />
          </fieldset>
        </section>

        <section className="inspector-section">
          <div className="panel-title"><h2><Layers size={17} /> Слои</h2></div>
          {layers.length === 0 && <p className="muted">Слои появятся здесь после добавления объектов.</p>}
          <ul className="layers">
            {[...layers].reverse().map((layer) => <li key={layer.id}>
              <button aria-pressed={layer.id === selectedId} onClick={() => setSelectedId(layer.id)}>
                {sceneAssets.get(layer.assetId)?.name ?? layer.assetId}
                {sceneAssets.get(layer.assetId)?.role === 'background' && <small>Фон</small>}
              </button>
            </li>)}
          </ul>
        </section>

        {selected && selectedAsset && <section className="inspector-section">
          <div className="panel-title"><h2>{selectedAsset.name}</h2></div>
          <div className="fields">
            <NumberField label="X" value={Math.round(selected.x)} onChange={(x) => patchLayer(selected.id, { x })} />
            <NumberField label="Y" value={Math.round(selected.y)} onChange={(y) => patchLayer(selected.id, { y })} />
            <NumberField label="Угол, °" value={selected.rotation}
              onChange={(rotation) => patchLayer(selected.id, { rotation })} />
            <NumberField label="Масштаб, %" value={Math.round(selected.scale * 100)} min={1}
              onChange={(scale) => patchLayer(selected.id, { scale: scale / 100 })} />
          </div>
          <div className="layer-actions">
            <button className="icon-button" aria-label="Поднять слой" title="Поднять слой"
              disabled={layers.at(-1)?.id === selected.id} onClick={() => reorderLayer(selected.id, 1)}>
              <ArrowUp size={16} />
            </button>
            <button className="icon-button" aria-label="Опустить слой" title="Опустить слой"
              disabled={layers[0]?.id === selected.id} onClick={() => reorderLayer(selected.id, -1)}>
              <ArrowDown size={16} />
            </button>
            <button className="icon-button" aria-label="Дублировать слой" title="Дублировать слой"
              onClick={() => duplicateLayer(selected)}><Copy size={16} /></button>
            <button className="icon-button danger" aria-label="Удалить слой" title="Удалить слой"
              onClick={() => deleteLayer(selected.id)}><Trash2 size={16} /></button>
          </div>
        </section>}
      </aside>
    </main>
  </>;
}

function NumberField({ label, value, min, onChange }: {
  label: string; value: number; min?: number; onChange: (value: number) => void;
}) {
  return <label className="number-field">
    <span>{label}</span>
    <input type="number" key={value} defaultValue={value} min={min} onBlur={(event) => {
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next) && Math.abs(next) < 1_000_000 && (min === undefined || next >= min)) {
        if (next !== value) onChange(next);
      } else {
        event.target.value = String(value);
      }
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
  </label>;
}
