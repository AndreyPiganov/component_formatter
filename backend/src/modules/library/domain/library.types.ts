import type { CatalogComponent } from '../../../common/domain/catalog-component';

export interface LibraryAsset extends CatalogComponent {
  componentId: string;
  source: string;
  sourceFile: string | null;
  detail: 'simple' | 'detailed' | 'any';
  svg: string;
}

export interface LibraryCatalog {
  entries: LibraryAsset[];
  skipped: number;
}
