import type { LibraryAsset, LibraryCandidate } from '../domain/library.types';

export abstract class LibraryRepository {
  abstract listVariants(): Promise<LibraryAsset[]>;
  abstract listCandidates(detail?: 'simple' | 'detailed', ids?: string[]): Promise<LibraryCandidate[]>;
  abstract syncCatalog(entries: LibraryAsset[], complete: boolean): Promise<void>;
}
