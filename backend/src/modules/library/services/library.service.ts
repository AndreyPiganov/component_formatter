import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { LibraryCatalog } from '../domain/library.types';
import { LibraryRepository } from '../repositories/library.repository';
import { FileCatalogSource } from '../sources/file-catalog.source';

@Injectable()
export class LibraryService implements OnModuleInit {
  private skipped = 0;

  constructor(
    private readonly repository: LibraryRepository,
    private readonly source: FileCatalogSource,
  ) {}

  async onModuleInit() {
    const catalog = await this.source.readCatalog();
    if (!catalog) return;
    const complete = catalog.skipped === 0;
    if (complete || catalog.entries.length) {
      await this.repository.syncCatalog(catalog.entries, complete);
    }
    this.skipped = catalog.skipped;
  }

  async getCatalog(): Promise<LibraryCatalog> {
    return { entries: await this.repository.listVariants(), skipped: this.skipped };
  }
}
