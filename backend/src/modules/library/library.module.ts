import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/app-config.module';
import { LibraryController } from './controllers/library.controller';
import { FileLibraryRepository } from './repositories/file-library.repository';
import { LibraryRepository } from './repositories/library.repository';
import { LibraryService } from './services/library.service';

@Module({
  imports: [AppConfigModule],
  controllers: [LibraryController],
  providers: [LibraryService, { provide: LibraryRepository, useClass: FileLibraryRepository }],
})
export class LibraryModule {}
