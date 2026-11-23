import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowDown, ArrowUp, Copy, Download, FlipHorizontal2, FlipVertical2, Grid2X2, Layers, Palette, Plus,
  Search, Sparkles, Trash2, Upload,
} from 'lucide-react';
import { loadLibrary, selectObjects, type CompositionMode } from './api';
import { Canvas } from './Canvas';
import { assetPalette, parseScheme, schemeColors, schemes, type Scheme } from './palette';
import { arrangeObjects, assetsForLayers, formats, initialScale, placeAsset, resizeLayers, scaleComposition, visibleAssets } from './scene';
import { exportSvg, maxSvgBytes, newId, parseSvg, type Layer, type SvgAsset } from './svg';

import type { Draft, DraftStore, PersonalAsset } from './draft';

type Background = number | 'transparent';

function saveFile(svg: string, personal: boolean) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.download = personal ? 'personal-composition.svg' : 'composition.svg';
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface AppProps {
  store?: Pick<DraftStore, 'save'>;
  draft?: Draft;
  importedFiles?: PersonalAsset[];
  storageError?: string;
}

export default function App({ store, draft, importedFiles, storageError = '' }: AppProps) {
  const [sourceAssets, setSourceAssets] = useState<SvgAsset[]>([]);
  const [imported, setImported] = useState<PersonalAsset[]>(importedFiles ?? []);
  const [libraryStatus, setLibraryStatus] = useState('Загрузка библиотеки…');
  const [layers, updateLayers] = useState<Layer[]>(draft?.layers ?? []);
  const revision = useRef(0);
  const [proposal, setProposal] = useState<{ layers: Layer[]; message: string } | null>(draft?.proposal ?? null);

  function setLayers(update: Layer[] | ((current: Layer[]) => Layer[])) {
    revision.current++;
    updateLayers(update);
  }
  const [selectedIds, setSelectedIds] = useState<string[]>(draft?.selectedIds ?? (draft?.selectedId ? [draft.selectedId] : []));
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  function selectOne(id: string | null) {
    setSelectedIds(id ? [id] : []);
  }
  const [formatIndex, setFormatIndex] = useState(draft?.formatIndex ?? 0);
  const [paletteList, setPaletteList] = useState<Scheme[]>(draft?.paletteList ?? schemes);
  const [schemeIndex, setSchemeIndex] = useState(draft?.schemeIndex ?? 0);
  const [background, setBackground] = useState<Background>(draft?.background ?? 0);
  const [query, setQuery] = useState(draft?.query ?? '');
  const [mode, setMode] = useState<CompositionMode>(draft?.mode ?? 'metaphor');
  const [prompt, setPrompt] = useState(draft?.prompt ?? '');
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState('');
  const libraryUpload = useRef<HTMLInputElement>(null);
  const paletteUpload = useRef<HTMLInputElement>(null);

  const [saveError, setSaveError] = useState(storageError);
  const snapshot = useMemo<Draft>(() => ({
    layers, personalIds: imported.map((asset) => asset.id), selectedId, selectedIds, formatIndex, paletteList,
    schemeIndex, background, query, mode, prompt, proposal,
  }), [layers, imported, selectedId, selectedIds, formatIndex, paletteList, schemeIndex, background, query, mode, prompt, proposal]);
  const previous = useRef(snapshot);
  useEffect(() => {
    if (!store || previous.current === snapshot) return;
    previous.current = snapshot;
    let current = true;
    async function write() {
      try {
        await store!.save(snapshot, imported);
        if (current) setSaveError('');
      } catch {
        if (current) setSaveError('Браузер не сохранил последние изменения. Можно скачать SVG.');
      }
    }
    void write();
    return () => { current = false; };
  }, [store, snapshot, imported]);

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
  const missingArtwork = layers.some((layer) => !sceneAssets.has(layer.assetId));
  const retained = [...new Set(layers.filter((layer) => sceneAssets.has(layer.assetId) && !available.has(layer.assetId))
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

  const otherRole = selectedAsset?.componentId && [...available.values()].find((asset) =>
    asset.componentId === selectedAsset.componentId && asset.role !== selectedAsset.role);

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
      artboard.height / 2 + (layers.length % 5) * 20,
      layers[0]?.scale ?? initialScale(personalIds.has(asset.id) ? [asset] : sourceAssets, artboard));
    setLayers((current) => [...current, layer]);
    selectOne(layer.id);
    setStatus('');
  }

  function patchLayer(id: string, patch: Partial<Layer>) {
    setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
  }

  function resizeScene(id: string, scale: number, pivot: { x: number; y: number }) {
    setLayers((current) => {
      const layer = current.find((item) => item.id === id);
      return layer ? scaleComposition(current, scale / layer.scale, pivot) : current;
    });
  }

  function deleteLayer(id: string) {
    setLayers((current) => current.filter((layer) => layer.id !== id));
    setSelectedIds((current) => current.filter((selected) => selected !== id));
  }

  function duplicateLayer(layer: Layer) {
    const duplicate = { ...layer, id: newId(), x: layer.x + 24, y: layer.y + 24 };
    setLayers((current) => [...current, duplicate]);
    selectOne(duplicate.id);
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
    setLayers((current) => resizeLayers(current, artboard, {
      width: nextFormat.width, height: nextFormat.height, background: artboard.background,
    }));
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
      const scene = arrangeObjects(chosen, artboard, selection.placements);
      const method = selection.method === 'ai' ? ' Подбор по смыслу.' :
        selection.method === 'keywords' ? ' Подбор по тегам.' : '';
      const unmatched = selection.unmatched.length ? ' Не добавлены: ' + selection.unmatched.join(', ') + '.' : '';
      const message = 'Добавлено объектов: ' + chosen.length + '.' + method + unmatched;
      if (revision.current === startedAt) {
        setLayers(scene);
        selectOne(null);
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
      <button className="button primary" disabled={!layers.length || missingArtwork}
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
          {layers.length > 0 && <NumberField label="Размер композиции, %" value={Number((layers[0].scale * 100).toFixed(2))}
            min={0.01} onChange={(percent) => resizeScene(layers[0].id, percent / 100,
              { x: artboard.width / 2, y: artboard.height / 2 })} />}
        </div>
        <Canvas artboard={artboard} layers={layers} assets={sceneAssets} palettes={palettes}
          selectedIds={selectedIds} select={setSelectedIds}
          move={(ids, anchor, x, y) => setLayers((current) => {
            const origin = current.find((layer) => layer.id === anchor);
            if (!origin) return current;
            const dx = x - origin.x, dy = y - origin.y;
            return current.map((layer) => ids.includes(layer.id) ? { ...layer, x: layer.x + dx, y: layer.y + dy } : layer);
          })} rotate={(id, rotation) => patchLayer(id, { rotation })}
          resize={resizeScene} remove={deleteLayer} />
        {missingArtwork && <p className="status">Ожидаем исходники слоёв из библиотеки. Экспорт станет доступен, когда все объекты загружены.</p>}
        {saveError && <p className="status" role="alert">{saveError}</p>}
        {personalScene && <p className="status">В композиции есть ваши SVG. Они войдут в экспорт.</p>}
        {retained.length > 0 && <p className="status">Для этого размера нет варианта у объектов
          {' «' + retained.join('», «') + '»'}. На холсте сохранена прежняя детализация.</p>}
        {proposal && <div className="status" role="status">
          Вы изменили сцену во время подбора. Заменить её собранной композицией?
          {' '}<button className="button secondary" onClick={() => {
            setLayers(proposal.layers);
            selectOne(null);
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
          {selectedIds.length > 1 && <p className="muted">Выбрано объектов: {selectedIds.length}</p>}
          <ul className="layers">
            {[...layers].reverse().map((layer) => <li key={layer.id}>
              <button aria-pressed={selectedIds.includes(layer.id)} onClick={() => selectOne(layer.id)}>
                {sceneAssets.get(layer.assetId)?.name ?? layer.assetId}
                {sceneAssets.get(layer.assetId)?.role === 'background' && <small>Фон</small>}
              </button>
            </li>)}
          </ul>
        </section>

        {selected && selectedAsset && <section className="inspector-section">
          <div className="panel-title"><h2>{selectedAsset.name}</h2></div>
          {otherRole && <label className="role-field">Роль объекта
            <select value={selectedAsset.role} onChange={() => patchLayer(selected.id, {
              assetId: otherRole.id,
              colorSlots: undefined,
            })}>
              <option value="main">Главный</option>
              <option value="background">Фоновый</option>
            </select>
          </label>}
          {scheme && selectedAsset.colors.length > 0 && <fieldset className="object-colors">
            <legend>Цвета объекта</legend>
            {selectedAsset.colors.map((source) => {
              const palette = palettes.get(selectedAsset.id)!;
              const base = schemeColors(schemes[0], selectedAsset.role);
              const targets = schemeColors(scheme, selectedAsset.role);
              const chosen = selected.colorSlots?.[source];
              const index = chosen ? base.indexOf(chosen) : targets.indexOf(palette.get(source)!);
              return <label key={source} className="object-paint">
                <span className="swatch" style={{ backgroundColor: source }} title={'Исходный цвет ' + source} />
                <span aria-hidden="true">→</span>
                <span className="swatch" style={{ backgroundColor: targets[index] }} />
                <select aria-label={'Замена цвета ' + source} value={index} onChange={(event) =>
                  patchLayer(selected.id, { colorSlots: { ...selected.colorSlots, [source]: base[Number(event.target.value)] } })}>
                  {targets.map((color, slot) => <option key={slot} value={slot}>{color.toUpperCase()}</option>)}
                </select>
              </label>;
            })}
            {selected.colorSlots && <button className="button secondary"
              onClick={() => patchLayer(selected.id, { colorSlots: undefined })}>Сбросить цвета объекта</button>}
          </fieldset>}
          {!scheme && <p className="muted">Для перекраски объекта выберите цветовую схему.</p>}
          <div className="fields">
            <NumberField label="X" value={Math.round(selected.x)} onChange={(x) => patchLayer(selected.id, { x })} />
            <NumberField label="Y" value={Math.round(selected.y)} onChange={(y) => patchLayer(selected.id, { y })} />
            <NumberField label="Угол, °" value={selected.rotation}
              onChange={(rotation) => patchLayer(selected.id, { rotation })} />
          </div>
          <div className="layer-actions">
            <button className="icon-button" aria-label="Отразить по горизонтали" title="Отразить по горизонтали"
              aria-pressed={!!selected.flipX} onClick={() => patchLayer(selected.id, { flipX: !selected.flipX })}>
              <FlipHorizontal2 size={16} />
            </button>
            <button className="icon-button" aria-label="Отразить по вертикали" title="Отразить по вертикали"
              aria-pressed={!!selected.flipY} onClick={() => patchLayer(selected.id, { flipY: !selected.flipY })}>
              <FlipVertical2 size={16} />
            </button>
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
