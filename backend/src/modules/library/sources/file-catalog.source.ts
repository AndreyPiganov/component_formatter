import { Injectable, Logger } from '@nestjs/common';
import { validateCatalogSvg } from './validate-catalog-svg';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { readCatalogComponent } from '../../../common/domain/catalog-component';
import { AppConfigService } from '../../../config/app-config.service';
import type { LibraryCatalog } from '../domain/library.types';

@Injectable()
export class FileCatalogSource {
  private readonly logger = new Logger(FileCatalogSource.name);

  constructor(private readonly config: AppConfigService) {}

  async readCatalog(): Promise<LibraryCatalog | undefined> {
    const directory = resolve(this.config.assetsDir);
    const catalog: LibraryCatalog = { entries: [], skipped: 0 };
    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(resolve(directory, 'catalog.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.logger.warn('Не удалось прочитать assets/catalog.json.');
      catalog.skipped = 1;
      return catalog;
    }
    if (!Array.isArray(manifest)) {
      this.logger.warn('В assets/catalog.json ожидается массив.');
      catalog.skipped = 1;
      return catalog;
    }

    const root = await realpath(directory);
    const keys = new Set<string>();
    const styles = new Map<string, string>();
    const subjects = new Map<string, string>();
    const publicStyles = new Map<string, string>();
    for (const [index, record] of (manifest as unknown[]).entries()) {
      try {
        const component = readCatalogComponent(record);
        const { file, source, detail, componentId: explicitId } = component
          ? record as { file?: unknown; source?: unknown; detail?: unknown; componentId?: unknown }
          : {};
        if (!component || typeof file !== 'string' || isAbsolute(file) ||
            extname(file).toLowerCase() !== '.svg' ||
            typeof source !== 'string' || !source.trim() ||
            (detail !== 'detailed' && detail !== 'simple' && detail !== 'any')) {
          throw new Error('укажите id, name, role, detail, source и относительный путь к SVG');
        }
        const key = detail + '/' + component.id;
        if (keys.has(key)) throw new Error('повторяющийся вариант ' + key);
        const suffix = '-' + component.role;
        const componentId = explicitId ?? (component.id.endsWith(suffix) ? component.id.slice(0, -suffix.length) : component.id);
        if (typeof componentId !== 'string' || !/^[a-z\d][a-z\d_-]{0,63}$/i.test(componentId)) {
          throw new Error('некорректный componentId');
        }
        const style = componentId + '/' + component.role;
        const metadataKey = JSON.stringify([component.name, component.tags]);
        if ((subjects.has(componentId) && subjects.get(componentId) !== metadataKey) ||
            (styles.has(style) && styles.get(style) !== component.id) ||
            (publicStyles.has(component.id) && publicStyles.get(component.id) !== style)) {
          throw new Error('несогласованные варианты объекта ' + componentId);
        }
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
        validateCatalogSvg(svg);
        catalog.entries.push({ ...component, componentId, sourceFile: localPath.split(sep).join('/'), source: source.trim().slice(0, 120), detail, svg });
        keys.add(key);
        styles.set(style, component.id);
        subjects.set(componentId, metadataKey);
        publicStyles.set(component.id, style);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('Пропущена запись каталога ' + (index + 1) + '. ' + message);
        catalog.skipped++;
      }
    }
    this.logger.log('В библиотеке SVG-вариантов: ' + catalog.entries.length);
    return catalog;
  }
}
