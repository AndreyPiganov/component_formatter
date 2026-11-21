import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { readCandidate, type Candidate } from '../composition/input';

interface LibraryAsset extends Candidate {
  source: string;
  detail: 'simple' | 'detailed' | 'any';
  svg: string;
}

@Injectable()
export class LibraryService implements OnModuleInit {
  private readonly logger = new Logger(LibraryService.name);
  private catalog: { entries: LibraryAsset[]; skipped: number } = { entries: [], skipped: 0 };

  async onModuleInit() {
    const directory = resolve(process.env.ASSETS_DIR || '../assets');
    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(resolve(directory, 'catalog.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Не удалось прочитать assets/catalog.json.');
        this.catalog.skipped = 1;
      }
      return;
    }
    if (!Array.isArray(manifest)) {
      this.logger.warn('В assets/catalog.json ожидается массив.');
      this.catalog.skipped = 1;
      return;
    }

    const root = await realpath(directory);
    const keys = new Set<string>();
    const entries: LibraryAsset[] = [];
    for (const record of manifest) {
      try {
        const candidate = readCandidate(record);
        const { file, source, detail } = record;
        if (!candidate || typeof file !== 'string' || isAbsolute(file) ||
            extname(file).toLowerCase() !== '.svg' ||
            typeof source !== 'string' || !source.trim() ||
            (detail !== 'detailed' && detail !== 'simple' && detail !== 'any')) {
          throw new Error('укажите id, name, role, detail, source и относительный путь к SVG');
        }
        const key = detail + '/' + candidate.id;
        if (keys.has(key)) throw new Error('повторяющийся вариант ' + key);
        const target = await realpath(resolve(root, file));
        const localPath = relative(root, target);
        if (localPath === '..' || localPath.startsWith('..' + sep) || isAbsolute(localPath)) {
          throw new Error('SVG должен находиться внутри assets');
        }
        const metadata = await stat(target);
        if (!metadata.isFile() || metadata.size > 1024 * 1024) {
          throw new Error('нужен SVG-файл размером до 1 МБ');
        }
        const svg = await readFile(target, 'utf8');
        entries.push({ ...candidate, source: source.trim().slice(0, 120), detail, svg });
        keys.add(key);
      } catch (error) {
        this.logger.warn('Пропущена запись каталога ' + (entries.length + this.catalog.skipped + 1) +
          '. ' + (error as Error).message);
        this.catalog.skipped++;
      }
    }
    this.catalog.entries = entries;
    this.logger.log('В библиотеке SVG-вариантов: ' + entries.length);
  }

  getCatalog() {
    return this.catalog;
  }
}
