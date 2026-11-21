import { Controller, Get } from '@nestjs/common';
import { LibraryService } from '../services/library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  list() {
    return this.library.getCatalog();
  }
}
