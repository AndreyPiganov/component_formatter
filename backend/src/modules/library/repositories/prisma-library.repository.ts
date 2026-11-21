import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { LibraryAsset } from '../domain/library.types';
import { LibraryRepository } from './library.repository';

@Injectable()
export class PrismaLibraryRepository implements LibraryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listVariants(): Promise<LibraryAsset[]> {
    const variants = await this.prisma.client.componentVariant.findMany({
      orderBy: [{ sortOrder: 'asc' }, { componentId: 'asc' }, { detail: 'asc' }],
    });
    return variants.map(({ componentId, name, role, tags, source, detail, svg }) => ({
      id: componentId, name, role, tags, source, detail, svg,
    }));
  }

  async syncCatalog(entries: LibraryAsset[], complete: boolean): Promise<void> {
    const components = [...new Set(entries.map(({ id }) => id))].map((id) => ({ id }));
    const keys = entries.map(({ id, detail }) => ({ componentId: id, detail }));

    await this.prisma.client.$transaction(async (tx) => {
      // A transaction-level lock serializes imports across backend instances.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128680788, 1)::text`;

      if (components.length) {
        await tx.component.createMany({ data: components, skipDuplicates: true });
      }

      for (const [sortOrder, { id: componentId, detail, ...variant }] of entries.entries()) {
        const data = { ...variant, sortOrder };
        await tx.componentVariant.upsert({
          where: { componentId_detail: { componentId, detail } },
          create: { componentId, detail, ...data },
          update: data,
        });
      }

      if (complete) {
        await tx.componentVariant.deleteMany({
          where: keys.length ? { NOT: { OR: keys } } : undefined,
        });
        await tx.component.deleteMany({ where: { variants: { none: {} } } });
      }
    }, { timeout: 30_000 });
  }
}
