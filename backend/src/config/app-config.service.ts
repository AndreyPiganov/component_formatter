import { Injectable } from '@nestjs/common';
import { readDatabaseUrl } from './database.config';

@Injectable()
export class AppConfigService {
  get backendHost() {
    return process.env.BACKEND_HOST || '127.0.0.1';
  }

  get assetsDir() {
    return process.env.ASSETS_DIR || '../assets';
  }

  get databaseUrl() {
    return readDatabaseUrl();
  }

  get openAiApiKey() {
    return process.env.OPENAI_API_KEY?.trim();
  }

  get openAiModel() {
    return process.env.OPENAI_MODEL?.trim() || 'gpt-5.4';
  }
}
