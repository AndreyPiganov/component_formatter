import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { LibraryCatalog } from '../domain/library.types';
import { LibraryRepository } from '../repositories/library.repository';

@Injectable()
export class LibraryService implements OnModuleInit {
  private catalog: LibraryCatalog = { entries: [], skipped: 0 };

  constructor(private readonly repository: LibraryRepository) {}

  async onModuleInit() {
    this.catalog = await this.repository.readCatalog();
  }

  getCatalog(): LibraryCatalog {
    return this.catalog;
  }
}
