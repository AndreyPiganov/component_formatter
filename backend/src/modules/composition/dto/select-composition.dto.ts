import { BadRequestException } from '@nestjs/common';
import { readCatalogComponent, type CatalogComponent } from '../../../common/domain/catalog-component';
import type { CompositionRequest } from '../domain/composition.types';

export function readCompositionRequest(value: unknown): CompositionRequest {
  if (!value || typeof value !== 'object') throw new BadRequestException('Ожидается JSON-запрос.');
  const { mode, text, candidates } = value as Partial<CompositionRequest>;
  if (mode !== 'names' && mode !== 'metaphor') throw new BadRequestException('Неизвестный режим.');
  if (typeof text !== 'string' || !text.trim() || text.length > 400) {
    throw new BadRequestException('Запрос должен содержать от 1 до 400 символов.');
  }
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 250) {
    throw new BadRequestException('Нужен список доступных объектов.');
  }
  const unique = new Map<string, CatalogComponent>();
  for (const input of candidates) {
    const candidate = readCatalogComponent(input);
    if (!candidate || unique.has(candidate.id)) throw new BadRequestException('Некорректный объект каталога.');
    unique.set(candidate.id, candidate);
  }
  return { mode, text: text.trim(), candidates: [...unique.values()] };
}
