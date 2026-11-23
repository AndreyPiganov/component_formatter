import { Injectable, Logger } from '@nestjs/common';
import type { LibraryCandidate } from '../../library/domain/library.types';
import { AppConfigService } from '../../../config/app-config.service';
import type { ScenePlacement } from '../../../common/svg/placement';

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

  constructor(private readonly config: AppConfigService) {}

  async select(text: string, candidates: LibraryCandidate[]): Promise<ScenePlacement[] | undefined> {
    const key = this.config.openAiApiKey;
    if (!key || !candidates.length) return;
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
            'Если сцене достаточно самих участников, оставь их одних. Соблюдай явные пожелания о ролях и количестве. ' +
            'Выбери до пяти разных предметов. Сначала поставь опорный предмет (relativeTo: null, dx: 0, dy: 0). ' +
            'Каждый следующий привяжи к ID одного из предыдущих. dx вправо, dy вниз, rotation в градусах по часовой стрелке. ' +
            'Смещение 1 означает касание краёв, 0.5 — частичное наложение, 0 — совпадение центров по этой оси. ' +
            'Например, монета выглядывает из края кошелька, а не висит в отдельной ячейке. Оставляй силуэты читаемыми. ' +
            'Фон рисуется позади цветных предметов, внутри роли следующие слои лежат поверх предыдущих. ' +
            'При отсутствии подходящих предметов верни пустой список.',
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
      const catalog = Array.from(subjects.values(), ({ id, name, tags, variants }) =>
        ({ id, name, tags, roles: Object.keys(variants) }));
      const idType = { type: 'string', enum: catalog.map(({ id }) => id) };
      const offset = { type: 'number', minimum: -1.5, maximum: 1.5 };
      const answer = await request({
        input: [...input, ...output, { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(catalog) }],
        tools: [tool], tool_choice: 'none',
        text: { format: { type: 'json_schema', name: 'selection', strict: true,
          schema: { type: 'object', additionalProperties: false, required: ['layers'],
            properties: { layers: { type: 'array', maxItems: 5, items: {
              type: 'object', additionalProperties: false, required: ['id', 'role', 'relativeTo', 'dx', 'dy', 'rotation'],
              properties: { id: idType, role: { type: 'string', enum: ['main', 'background'] },
                relativeTo: { anyOf: [idType, { type: 'null' }] }, dx: offset, dy: offset,
                rotation: { type: 'number', minimum: -180, maximum: 180 } },
            } } } } } },
      });
      const content = answer.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text');
      const { layers } = JSON.parse(content?.text ?? '{}');
      if (!Array.isArray(layers) || layers.length > 5) throw new Error('Некорректное число слоёв');
      const chosen = new Map<string, string>();
      return layers.map(({ id, role, relativeTo, dx, dy, rotation }, index) => {
        const subject = subjects.get(id);
        if (!subject || chosen.has(id) || (role !== 'main' && role !== 'background')) throw new Error('Недопустимый предмет');
        if (index === 0 ? relativeTo !== null : !chosen.has(relativeTo)) throw new Error('Некорректная опора');
        if (![dx, dy, rotation].every(Number.isFinite) || Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5 || Math.abs(rotation) > 180) {
          throw new Error('Некорректное размещение');
        }
        const { variants } = subject;
        const assetId = (role === 'main' ? variants.main : variants.background) ?? variants.main ?? variants.background!;
        const anchor = chosen.get(relativeTo) ?? null;
        chosen.set(id, assetId);
        return { assetId, relativeTo: anchor, dx, dy, rotation };
      });
    } catch (error) {
      this.logger.warn('Подбор по тегам. ' + (error instanceof Error ? error.message : 'Ошибка OpenAI'));
    }
  }
}
