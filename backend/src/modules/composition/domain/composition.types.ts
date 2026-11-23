import type { ScenePlacement } from '../../../common/svg/placement';
import type { SceneColorOptions, SceneColors } from '../../../common/svg/palette';

export interface CompositionRequest {
  mode: 'names' | 'metaphor';
  text: string;
  detail?: 'simple' | 'detailed';
  allowedIds?: string[];
  colorOptions?: SceneColorOptions;
}

export interface Selection {
  ids: string[];
  placements?: ScenePlacement[];
  colors?: SceneColors;
  unmatched: string[];
  method: 'names' | 'keywords' | 'ai';
}
