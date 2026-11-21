import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.checkHealth();
    } catch {
      throw new ServiceUnavailableException('PostgreSQL недоступен.');
    }
    return { status: 'ok' };
  }
}
