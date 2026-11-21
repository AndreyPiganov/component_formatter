import type { LibraryAsset } from '../domain/library.types';

export abstract class LibraryRepository {
  abstract listVariants(): Promise<LibraryAsset[]>;
  abstract syncCatalog(entries: LibraryAsset[], complete: boolean): Promise<void>;
}
