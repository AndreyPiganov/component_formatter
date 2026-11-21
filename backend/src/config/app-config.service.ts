import { Injectable } from '@nestjs/common';

@Injectable()
export class AppConfigService {
  get backendHost() {
    return process.env.BACKEND_HOST || '127.0.0.1';
  }

  get assetsDir() {
    return process.env.ASSETS_DIR || '../assets';
  }

  get openAiApiKey() {
    return process.env.OPENAI_API_KEY?.trim();
  }

  get openAiModel() {
    return process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  }
}
