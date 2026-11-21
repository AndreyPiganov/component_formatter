import { BadRequestException } from '@nestjs/common';

export interface Candidate {
  id: string;
  name: string;
  role: 'main' | 'background';
  tags: string[];
}

export interface CompositionRequest {
  mode: 'names' | 'metaphor';
  text: string;
  candidates: Candidate[];
}

export interface Selection {
  ids: string[];
  unmatched: string[];
  method: 'names' | 'keywords' | 'ai';
}

export function readCandidate(value: unknown): Candidate | undefined {
  if (!value || typeof value !== 'object') return;
  const { id, name, role, tags = [] } = value as Partial<Candidate>;
  if (typeof id !== 'string' || !/^[a-z\d][a-z\d_-]{0,63}$/i.test(id) ||
      typeof name !== 'string' || !name.trim() || name.length > 160 ||
      (role !== 'main' && role !== 'background') || !Array.isArray(tags) || tags.length > 24 ||
      tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) {
    return;
  }
  return { id, name: name.trim(), role, tags };
}

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
  const unique = new Map<string, Candidate>();
  for (const input of candidates) {
    const candidate = readCandidate(input);
    if (!candidate || unique.has(candidate.id)) throw new BadRequestException('Некорректный объект каталога.');
    unique.set(candidate.id, candidate);
  }
  return { mode, text: text.trim(), candidates: [...unique.values()] };
}
