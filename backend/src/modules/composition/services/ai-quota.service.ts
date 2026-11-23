import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AiQuotaService {
  constructor(private readonly prisma: PrismaService, private readonly config: AppConfigService) {}

  async reserve() {
    const limits = this.config.aiQuota;
    await this.prisma.client.$transaction(async (tx) => {
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP AS now`;
      const minute = new Date(now);
      minute.setUTCSeconds(0, 0);
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);

      // Acquire both counters in the same order. A rejected reservation rolls both back.
      for (const [period, startsAt, limit] of [['minute', minute, limits.minute], ['day', day, limits.day]] as const) {
        await tx.aiUsageWindow.updateMany({
          where: { period, startsAt: { lt: startsAt } }, data: { startsAt, used: 0 },
        });
        const reserved = await tx.aiUsageWindow.updateMany({
          where: { period, used: { lt: limit } }, data: { used: { increment: 1 } },
        });
        if (!reserved.count) {
          const message = period === 'minute' ? 'Повторите с начала следующей минуты.' : 'Попробуйте после 00:00 UTC.';
          throw new HttpException('Исчерпан лимит AI-сборок. ' + message, HttpStatus.TOO_MANY_REQUESTS);
        }
      }
    });
  }
}
