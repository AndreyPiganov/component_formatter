import { Injectable } from '@nestjs/common';
import { OpenAiClient } from '../clients/open-ai.client';
import { selectByKeywords, selectByNames } from '../domain/composition-matcher';
import type { CompositionRequest, Selection } from '../domain/composition.types';

@Injectable()
export class CompositionService {
  constructor(private readonly openAi: OpenAiClient) {}

  async select(request: CompositionRequest): Promise<Selection> {
    const { mode, text, candidates } = request;
    if (mode === 'names') return selectByNames(text, candidates);
    const ids = await this.openAi.select(text, candidates);
    if (ids) return { ids, unmatched: [], method: 'ai' };
    return selectByKeywords(text, candidates);
  }
}
