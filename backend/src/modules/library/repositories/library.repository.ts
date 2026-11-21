import type { LibraryCatalog } from '../domain/library.types';

export abstract class LibraryRepository {
  abstract readCatalog(): Promise<LibraryCatalog>;
}
