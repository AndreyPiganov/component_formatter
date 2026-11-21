export interface CompositionRequest {
  mode: 'names' | 'metaphor';
  text: string;
  detail?: 'simple' | 'detailed';
  allowedIds?: string[];
}

export interface Selection {
  ids: string[];
  unmatched: string[];
  method: 'names' | 'keywords' | 'ai';
}
