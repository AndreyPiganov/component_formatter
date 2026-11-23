import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { CompositionModule } from './modules/composition/composition.module';
import { HealthModule } from './modules/health/health.module';
import { LibraryModule } from './modules/library/library.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env', load: [appConfig] }),
    HealthModule,
    LibraryModule,
    CompositionModule,
  ],
})
export class AppModule {}
