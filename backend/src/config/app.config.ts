import { registerAs, type ConfigType } from '@nestjs/config';
import { readDatabaseUrl } from './database.config';

// function readQuota(name: string, fallback: number) {
//   const raw = process.env[name]?.trim();
//   if (!raw) return fallback;
//   const limit = Number(raw);
//   if (!Number.isSafeInteger(limit) || limit < 0 || limit > 2_147_483_647) {
//     throw new Error(name + ' must be a non-negative 32-bit integer');
//   }
//   return limit;
// }

export const appConfig = registerAs('app', () => ({
  backendHost: process.env.BACKEND_HOST || '127.0.0.1',
  assetsDir: process.env.ASSETS_DIR || '../assets',
  databaseUrl: readDatabaseUrl(),
  openAiApiKey: process.env.OPENAI_API_KEY?.trim(),
  openAiModel: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4',
  // aiQuota: { minute: readQuota('AI_COMPOSITIONS_PER_MINUTE', 6), day: readQuota('AI_COMPOSITIONS_PER_DAY', 60) },
}));

export type AppConfig = ConfigType<typeof appConfig>;
