import { LibraryService } from '../../library/services/library.service';
import { Injectable } from '@nestjs/common';
import { OpenAiClient } from '../clients/open-ai.client';
import { sceneTags, selectByKeywords, selectByNames } from '../domain/composition-matcher';
import type { CompositionRequest, Selection } from '../domain/composition.types';

@Injectable()
export class CompositionService {
  constructor(private readonly openAi: OpenAiClient, private readonly library: LibraryService) {}

  async select(request: CompositionRequest): Promise<Selection> {
    const { mode, text, detail, allowedIds } = request;
    const candidates = await this.library.listCandidates(detail, allowedIds);
    if (mode === 'names') return selectByNames(text, candidates);
    if (!candidates.length) return { ids: [], unmatched: [], method: 'keywords' };
    const ids = await this.openAi.select(text, candidates);
    const tags = sceneTags(text);
    if (ids && (ids.length !== 1 || !tags.length)) return { ids, unmatched: [], method: 'ai' };
    const local = selectByKeywords(text, candidates, tags);
    if (ids && (local.ids.length < 2 || !local.ids.includes(ids[0]))) {
      return { ids, unmatched: [], method: 'ai' };
    }
    return local;
  }
}
