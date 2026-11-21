import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { CompositionService } from './composition.service';
import { readCompositionRequest } from './input';
import { OpenAiService } from './open-ai.service';

@Controller('compositions')
class CompositionController {
  constructor(private readonly composition: CompositionService) {}

  @Post('select')
  @HttpCode(200)
  select(@Body() body: unknown) {
    return this.composition.select(readCompositionRequest(body));
  }
}

@Module({ controllers: [CompositionController], providers: [CompositionService, OpenAiService] })
export class CompositionModule {}
