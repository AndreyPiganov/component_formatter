import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { CompositionModule } from './modules/composition/composition.module';
import { HealthModule } from './modules/health/health.module';
import { LibraryModule } from './modules/library/library.module';

@Module({ imports: [AppConfigModule, HealthModule, LibraryModule, CompositionModule] })
export class AppModule {}
