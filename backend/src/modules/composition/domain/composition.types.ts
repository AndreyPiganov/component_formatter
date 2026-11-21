import type { CatalogComponent } from '../../../common/domain/catalog-component';

export interface CompositionRequest {
  mode: 'names' | 'metaphor';
  text: string;
  candidates: CatalogComponent[];
}

export interface Selection {
  ids: string[];
  unmatched: string[];
  method: 'names' | 'keywords' | 'ai';
}
