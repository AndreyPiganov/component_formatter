// import { PrismaModule } from '../../database/prisma.module';
// import { AiQuotaService } from './services/ai-quota.service';
import { LibraryModule } from '../library/library.module';
import { Module } from '@nestjs/common';
import { OpenAiClient } from './clients/open-ai.client';
import { CompositionController } from './controllers/composition.controller';
import { CompositionService } from './services/composition.service';

@Module({
  imports: [
    LibraryModule,
    // PrismaModule,
  ],
  controllers: [CompositionController],
  providers: [
    CompositionService,
    OpenAiClient,
    // AiQuotaService,
  ],
})
export class CompositionModule {}
