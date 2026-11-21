import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { readCompositionRequest } from '../dto/select-composition.dto';
import { CompositionService } from '../services/composition.service';

@Controller('compositions')
export class CompositionController {
  constructor(private readonly composition: CompositionService) {}

  @Post('select')
  @HttpCode(200)
  select(@Body() body: unknown) {
    return this.composition.select(readCompositionRequest(body));
  }
}
