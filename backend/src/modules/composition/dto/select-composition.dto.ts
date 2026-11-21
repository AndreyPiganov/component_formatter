import { BadRequestException } from '@nestjs/common';
import { readCatalogComponent } from '../../../common/domain/catalog-component';
import type { CompositionRequest } from '../domain/composition.types';

export function readCompositionRequest(value: unknown): CompositionRequest {
  if (!value || typeof value !== 'object') throw new BadRequestException('Ожидается JSON-запрос.');
  const { mode, text, detail, candidates } = value as Partial<CompositionRequest> & { candidates?: unknown };
  if (mode !== 'names' && mode !== 'metaphor') throw new BadRequestException('Неизвестный режим.');
  if (typeof text !== 'string' || !text.trim() || text.length > 400) {
    throw new BadRequestException('Запрос должен содержать от 1 до 400 символов.');
  }
  if (detail !== undefined && detail !== 'simple' && detail !== 'detailed') {
    throw new BadRequestException('Неизвестная детализация.');
  }
  // Older editors sent visible candidates. Their IDs may narrow the DB selection.
  if (candidates !== undefined) {
    if (!Array.isArray(candidates) || !candidates.length || candidates.length > 250) {
      throw new BadRequestException('Некорректный список объектов.');
    }
    const ids = new Set<string>();
    for (const input of candidates) {
      const candidate = readCatalogComponent(input);
      if (!candidate || ids.has(candidate.id)) throw new BadRequestException('Некорректный объект каталога.');
      ids.add(candidate.id);
    }
    return { mode, text: text.trim(), detail, allowedIds: [...ids] };
  }
  if (!detail) throw new BadRequestException('Укажите детализацию холста.');
  return { mode, text: text.trim(), detail };
}
