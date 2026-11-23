import type { ScenePlacement } from '../../../common/svg/placement';

export interface CompositionRequest {
  mode: 'names' | 'metaphor';
  text: string;
  detail?: 'simple' | 'detailed';
  allowedIds?: string[];
}

export interface Selection {
  ids: string[];
  placements?: ScenePlacement[];
  unmatched: string[];
  method: 'names' | 'keywords' | 'ai';
}
