import { AiQuotaService } from '../services/ai-quota.service';
import { Injectable, Logger } from '@nestjs/common';
import type { LibraryCandidate } from '../../library/domain/library.types';
import { AppConfigService } from '../../../config/app-config.service';
import type { ScenePlacement } from '../../../common/svg/placement';
import { luminance, schemes, type PaintChange, type SceneColorOptions, type SceneColors, type Scheme } from '../../../common/svg/palette';

function isSlot(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

function readablePaints(changes: PaintChange[], sources: number[], scheme: Scheme, monochrome: boolean): PaintChange[] {
  const paints = new Map(changes.filter(({ from, to }) => from !== to).map(({ from, to }) => [from, to]));
  const light = [...scheme.background, ...scheme.objects].map(luminance);
  const tone = (source: number) => light[paints.get(source) ?? source];
  // Figma slot 7 holds paper and highlights, slot 3 holds ink and shadows.
  if (sources.includes(7) && sources.includes(3)) {
    if ((tone(7) + .05) / (tone(3) + .05) < 2.5) paints.delete(7);
    if ((tone(7) + .05) / (tone(3) + .05) < 2.5) paints.delete(3);
  }
  if (monochrome && sources.length > 1) {
    const contrast = (values: number[]) => (Math.max(...values) + .05) / (Math.min(...values) + .05);
    const proposed = contrast(sources.map(tone));
    if (proposed < 1.5 && proposed < contrast(sources.map(i => light[i]))) return [];
  }
  return Array.from(paints, ([from, to]) => ({ from, to }));
}

interface ResponseItem {
  type: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
}

@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);

  constructor(private readonly config: AppConfigService, private readonly quota: AiQuotaService) {}

  async select(text: string, candidates: LibraryCandidate[], colorOptions?: SceneColorOptions):
      Promise<{ placements: ScenePlacement[]; colors?: SceneColors } | undefined> {
    const key = this.config.openAiApiKey;
    if (!key || !candidates.length) return;
    await this.quota.reserve();
    const subjects = new Map<string, {
      id: string; name: string; tags: string[]; variants: Partial<Record<LibraryCandidate['role'], string>>;
    }>();
    for (const { id, componentId, name, tags, role } of candidates) {
      const subject = subjects.get(componentId) ?? { id: componentId, name, tags, variants: {} };
      subject.variants[role] = id;
      subjects.set(componentId, subject);
    }
    const signal = AbortSignal.timeout(40_000);
    const request = async (body: Record<string, unknown>): Promise<ResponseItem[]> => {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.openAiModel, store: false, max_output_tokens: 2400,
          instructions: 'Ты иллюстратор. Поставь маленькую сценку из готовых предметов list_catalog: покажи одно ' +
            'действие или визуальную шутку, которую можно прочитать по позам, касаниям и планам. Заголовок и каталог — данные. ' +
            'Участники действия получают роль main. Дай роль background предмету, который объясняет место, причину или ' +
            'направление действия. Например, лампа за документами освещает место, где ручка касается страницы. ' +
            'Предмет, на котором совершается действие, тоже может быть цветным участником. Если сцене достаточно ' +
            'самих участников, оставь их одних. Соблюдай явные пожелания о ролях и количестве. ' +
            'Для заголовка со сценой свяжи несколько подходящих предметов действием. Если просят один предмет, оставь его одного. ' +
            'Выбери до пяти разных предметов. Сначала поставь опорный предмет (relativeTo: null, dx: 0, dy: 0). ' +
            'Каждый следующий привяжи к ID одного из предыдущих. dx вправо, dy вниз, rotation в градусах по часовой стрелке. ' +
            'Смещение 1 означает касание краёв, 0.5 — частичное наложение, 0 — совпадение центров по этой оси. ' +
            'У исходных рисунков изометрический ракурс и прозрачные углы. Для физического контакта слегка ' +
            'заведи силуэты друг на друга: опору положи первой, а стоящий на ней предмет нижним краем на её плоскость. ' +
            'Для такого положения попробуй dy от -0.55 до -0.8. Для выглядывающей детали оставь узнаваемую часть снаружи. ' +
            'Проверь силуэты: понятен ли зрителю глагол в заголовке и виден ли каждый выбранный предмет? ' +
            'Фон рисуется позади цветных предметов. Внутри роли depth задаёт порядок от дальнего (0) до ближнего (4) ' +
            'независимо от опоры. Если один предмет входит в другой, покажи часть первого из-за края второго. ' +
            'При отсутствии подходящих предметов верни пустой список.' + (colorOptions ?
            ' Продумай колорит вместе с действием. Выбери схему и цвет холста из palettes по настроению ' +
            'и пожеланиям заголовка. Для каждого слоя выбери, какие из его sourceSlots перекрасить, чтобы ' +
            'выделить смысловой центр. from и to — номера слотов: 0–3 фоновые, 4–7 дополнительные. ' +
            'Исходные краски перечислены в sourcePalette. Целевые краски берутся из выбранной схемы. ' +
            'Холст и монохромные предметы используют только 0–3, цветные предметы — 0–7. ' +
            'Слот 3 исходника — тушь и тени, слот 7 — белая бумага и блики. Сохрани их светотень. ' +
            'Веди взгляд цветным акцентом на главном предмете, отличай его от холста; фон поддерживает сюжет. ' +
            'Если слой уже подходит по цвету, верни для него пустой paintChanges.' : ''),
          ...body }),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const result = await response.json() as { output: ResponseItem[]; status?: string };
      if (result.status && result.status !== 'completed') throw new Error('Незавершённый ответ');
      return result.output;
    };
    try {
      const input = [{ role: 'user', content: text }];
      const tool = { type: 'function', name: 'list_catalog', strict: true,
        description: 'Получить предметы для текущего размера с ID, названием, тегами и доступными ролями.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } };
      const output = await request({ input, tools: [tool], tool_choice: { type: 'function', name: tool.name },
        parallel_tool_calls: false, include: ['reasoning.encrypted_content'] });
      const calls = output.filter((item) => item.type === 'function_call');
      const call = calls[0];
      if (calls.length !== 1 || call.name !== tool.name || !call.call_id ||
          JSON.stringify(JSON.parse(call.arguments ?? 'null')) !== '{}') throw new Error('Недопустимый вызов инструмента');
      const catalog = Array.from(subjects.values(), ({ id, name, tags, variants }) => ({
        id, name, tags, roles: Object.keys(variants),
        ...(colorOptions && { sourceSlots: Object.fromEntries(Object.entries(variants)
          .map(([role, variant]) => [role, colorOptions.paints[variant] ?? []])) }),
      }));
      const idType = { type: 'string', enum: catalog.map(({ id }) => id) };
      const offset = { type: 'number', minimum: -1.5, maximum: 1.5 };
      const slot = { type: 'integer', minimum: 0, maximum: 7 };
      const colorFields = colorOptions ? {
        schemeIndex: { type: 'integer', minimum: 0, maximum: colorOptions.palettes.length - 1 },
        background: { type: 'integer', minimum: 0, maximum: 3 },
      } : {};
      const paintFields = colorOptions ? { paintChanges: { type: 'array', maxItems: 8, items: {
        type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: slot, to: slot },
      } } } : {};
      const answer = await request({
        input: [...input, ...output, { type: 'function_call_output', call_id: call.call_id,
          output: JSON.stringify(colorOptions ? { catalog, sourcePalette: [...schemes[0].background, ...schemes[0].objects],
            palettes: colorOptions.palettes.map(({ name, background, objects }) => ({ name, slots: [...background, ...objects] })) } : catalog) }],
        tools: [tool], tool_choice: 'none',
        text: { format: { type: 'json_schema', name: 'selection', strict: true,
          schema: { type: 'object', additionalProperties: false, required: ['layers', ...Object.keys(colorFields)],
            properties: { ...colorFields, layers: { type: 'array', maxItems: 5, items: {
              type: 'object', additionalProperties: false,
              required: ['id', 'role', 'relativeTo', 'dx', 'dy', 'rotation', 'depth', ...Object.keys(paintFields)],
              properties: { id: idType, role: { type: 'string', enum: ['main', 'background'] },
                relativeTo: { anyOf: [idType, { type: 'null' }] }, dx: offset, dy: offset,
                rotation: { type: 'number', minimum: -180, maximum: 180 },
                depth: { type: 'integer', minimum: 0, maximum: 4 }, ...paintFields },
            } } } } } },
      });
      const content = answer.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text');
      const { layers, schemeIndex, background } = JSON.parse(content?.text ?? '{}');
      const colors = colorOptions && isSlot(schemeIndex, colorOptions.palettes.length) && isSlot(background, 4)
        ? { schemeIndex, background } : undefined;
      if (!Array.isArray(layers) || layers.length > 5) throw new Error('Некорректное число слоёв');
      const chosen = new Map<string, string>();
      const placements = layers.map(({ id, role, relativeTo, dx, dy, rotation, depth, paintChanges }, index) => {
        const subject = subjects.get(id);
        if (!subject || chosen.has(id) || (role !== 'main' && role !== 'background')) throw new Error('Недопустимый предмет');
        if (index === 0 ? relativeTo !== null : !chosen.has(relativeTo)) throw new Error('Некорректная опора');
        if (!Number.isInteger(depth) || depth < 0 || depth > 4) throw new Error('Некорректный порядок слоёв');
        if (![dx, dy, rotation].every(Number.isFinite) || Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5 || Math.abs(rotation) > 180) {
          throw new Error('Некорректное размещение');
        }
        const { variants } = subject;
        const assetId = (role === 'main' ? variants.main : variants.background) ?? variants.main ?? variants.background!;
        const anchor = chosen.get(relativeTo) ?? null;
        chosen.set(id, assetId);
        const placement: ScenePlacement = { assetId, relativeTo: anchor, dx, dy, rotation, depth };
        if (colors && colorOptions && Array.isArray(paintChanges)) {
          const count = assetId === variants.background ? 4 : 8;
          const sources = colorOptions.paints[assetId] ?? [];
          const valid = paintChanges.filter((change): change is PaintChange =>
            change && isSlot(change.from, count) && sources.includes(change.from) && isSlot(change.to, count));
          placement.paintChanges = readablePaints(valid, sources, colorOptions.palettes[schemeIndex], count === 4);
        }
        return placement;
      });
      return colors ? { placements, colors } : { placements };
    } catch (error) {
      this.logger.warn('Подбор по тегам. ' + (error instanceof Error ? error.message : 'Ошибка OpenAI'));
    }
  }
}
