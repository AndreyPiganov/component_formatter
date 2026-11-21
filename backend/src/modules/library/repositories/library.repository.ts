import type { CatalogComponent } from '../../../common/domain/catalog-component';
import type { LibraryAsset } from '../domain/library.types';

export abstract class LibraryRepository {
  abstract listVariants(): Promise<LibraryAsset[]>;
  abstract listCandidates(detail?: 'simple' | 'detailed', ids?: string[]): Promise<CatalogComponent[]>;
  abstract syncCatalog(entries: LibraryAsset[], complete: boolean): Promise<void>;
}
