import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/app-config.module';
import { PrismaModule } from '../../database/prisma.module';
import { LibraryController } from './controllers/library.controller';
import { LibraryRepository } from './repositories/library.repository';
import { PrismaLibraryRepository } from './repositories/prisma-library.repository';
import { LibraryService } from './services/library.service';
import { FileCatalogSource } from './sources/file-catalog.source';

@Module({
  imports: [AppConfigModule, PrismaModule],
  controllers: [LibraryController],
  providers: [LibraryService, FileCatalogSource, { provide: LibraryRepository, useClass: PrismaLibraryRepository }],
})
export class LibraryModule {}
