import type { CatalogComponent } from '../../../common/domain/catalog-component';

export interface LibraryCandidate extends CatalogComponent {
  componentId: string;
}

export interface LibraryAsset extends LibraryCandidate {
  source: string;
  sourceFile: string | null;
  detail: 'simple' | 'detailed' | 'any';
  svg: string;
}

export interface LibraryCatalog {
  entries: LibraryAsset[];
  skipped: number;
}
