import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { appConfig, type AppConfig } from '../config/app.config';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(appConfig.KEY) config: AppConfig) {
    const connectionString = config.databaseUrl;
    const schema = new URL(connectionString).searchParams.get('schema') || 'public';
    const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }, { schema });
    this.client = new PrismaClient({ adapter });
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  async checkHealth() {
    await this.client.$queryRaw`SELECT 1`;
  }
}
