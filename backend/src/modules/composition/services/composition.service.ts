import { LibraryService } from '../../library/services/library.service';
import { Injectable } from '@nestjs/common';
import { OpenAiClient } from '../clients/open-ai.client';
import { selectByKeywords, selectByNames } from '../domain/composition-matcher';
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
    if (ids) return { ids, unmatched: [], method: 'ai' };
    return selectByKeywords(text, candidates);
  }
}
