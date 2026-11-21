import { Controller, Get, Module } from '@nestjs/common';
import { LibraryService } from './library.service';

@Controller('library')
class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  list() {
    return this.library.getCatalog();
  }
}

@Module({ controllers: [LibraryController], providers: [LibraryService] })
export class LibraryModule {}
