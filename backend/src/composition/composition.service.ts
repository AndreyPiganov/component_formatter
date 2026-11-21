import { Injectable } from '@nestjs/common';
import type { Candidate, CompositionRequest, Selection } from './input';
import { OpenAiService } from './open-ai.service';

function words(text: string) {
  return text.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalize(text: string) {
  return words(text).join(' ');
}

function matchesWord(a: string, b: string) {
  return a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4));
}

function byNames(text: string, candidates: Candidate[]): Selection {
  const ids: string[] = [];
  const unmatched: string[] = [];
  for (const phrase of text.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)) {
    const requested = normalize(phrase);
    if (!requested) continue;
    const background = requested.endsWith(' фон');
    const name = background ? requested.slice(0, -4) : requested;
    const matching = candidates.filter((candidate) => (!background || candidate.role === 'background') &&
      [candidate.name, ...candidate.tags].some((term) => normalize(term) === name));
    const exact = matching.find((candidate) => normalize(candidate.name) === name && candidate.role === 'main');
    const match = exact ?? matching.find((candidate) => candidate.role === 'main') ?? matching[0];
    if (match && ids.length < 10) ids.push(match.id);
    else unmatched.push(phrase);
  }
  return { ids, unmatched, method: 'names' };
}

function byKeywords(text: string, candidates: Candidate[]): Selection {
  const tokens = [...new Set(words(text).filter((word) => word.length > 2))];
  const ranked = candidates.map((candidate) => {
    const names = words(candidate.name);
    const related = candidate.tags.flatMap(words);
    const score = tokens.reduce((sum, token) =>
      sum + (names.some((name) => matchesWord(name, token)) ? 4 :
        related.some((tag) => matchesWord(tag, token)) ? 1 : 0), 0);
    return { candidate, score };
  }).filter(({ score }) => score > 0).sort((a, b) =>
    b.score - a.score || Number(b.candidate.role === 'main') - Number(a.candidate.role === 'main'));
  const used = new Set<string>();
  const ids: string[] = [];
  for (const { candidate } of ranked) {
    const name = normalize(candidate.name);
    if (used.has(name)) continue;
    used.add(name);
    ids.push(candidate.id);
    if (ids.length === 4) break;
  }
  return { ids, unmatched: [], method: 'keywords' };
}

@Injectable()
export class CompositionService {
  constructor(private readonly openAi: OpenAiService) {}

  async select(request: CompositionRequest): Promise<Selection> {
    const { mode, text, candidates } = request;
    if (mode === 'names') return byNames(text, candidates);
    const ids = await this.openAi.select(text, candidates);
    if (ids) return { ids, unmatched: [], method: 'ai' };
    return byKeywords(text, candidates);
  }
}
