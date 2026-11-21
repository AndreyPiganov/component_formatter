import { Controller, Get, Module } from '@nestjs/common';
import { CompositionModule } from './composition/composition.module';
import { LibraryModule } from './library/library.module';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({ imports: [LibraryModule, CompositionModule], controllers: [HealthController] })
export class AppModule {}
