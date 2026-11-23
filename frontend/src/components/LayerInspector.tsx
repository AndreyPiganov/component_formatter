import { ArrowDown, ArrowUp, Copy, FlipHorizontal2, FlipVertical2, Trash2 } from 'lucide-react';
import { schemeColors, schemes, type Scheme } from '../model/palette';
import type { Layer, SvgAsset } from '../model/svg';
import { NumberField } from './NumberField';

interface LayerInspectorProps {
  selected: Layer;
  selectedAsset: SvgAsset;
  otherRole?: SvgAsset;
  scheme?: Scheme;
  palette: ReadonlyMap<string, string>;
  layers: Layer[];
  patchLayer: (id: string, patch: Partial<Layer>) => void;
  reorderLayer: (id: string, direction: -1 | 1) => void;
  duplicateLayer: (layer: Layer) => void;
  deleteLayer: (id: string) => void;
}

export function LayerInspector({ selected, selectedAsset, otherRole, scheme, palette, layers,
  patchLayer, reorderLayer, duplicateLayer, deleteLayer }: LayerInspectorProps) {
  return <section className="inspector-section">
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
  </section>;
}
