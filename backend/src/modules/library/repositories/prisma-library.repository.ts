import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { LibraryAsset } from '../domain/library.types';
import { LibraryRepository } from './library.repository';

@Injectable()
export class PrismaLibraryRepository implements LibraryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listVariants(): Promise<LibraryAsset[]> {
    const variants = await this.prisma.client.componentVariant.findMany({
      include: { component: { select: { name: true, tags: true } } },
      orderBy: [{ sortOrder: 'asc' }, { publicId: 'asc' }, { detail: 'asc' }],
    });
    return variants.map(({ publicId, component, componentId, role, source, sourceFile, detail, svg }) => ({
      id: publicId, ...component, componentId, role, source, sourceFile, detail, svg,
    }));
  }

  async listCandidates(detail?: 'simple' | 'detailed', ids?: string[]) {
    const variants = await this.prisma.client.componentVariant.findMany({
      where: { detail: detail && { in: [detail, 'any'] }, publicId: ids && { in: ids } },
      select: { publicId: true, role: true, component: { select: { name: true, tags: true } } },
      orderBy: [{ sortOrder: 'asc' }, { publicId: 'asc' }],
      distinct: ['publicId'],
    });
    return variants.map(({ publicId, role, component }) => ({ id: publicId, role, ...component }));
  }

  async syncCatalog(entries: LibraryAsset[], complete: boolean): Promise<void> {
    const subjects = new Map(entries.map(({ componentId, name, tags }) => [componentId, { name, tags }]));
    const keys = entries.map(({ componentId, role, detail, id: publicId }) => ({ componentId, role, detail, publicId }));

    await this.prisma.client.$transaction(async (tx) => {
      // A transaction-level lock serializes imports across backend instances.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128680788, 1)::text`;

      for (const [id, metadata] of subjects) {
        // A partial snapshot cannot rename other stored variants of this subject.
        await tx.component.upsert({
          where: { id }, create: { id, ...metadata }, update: complete ? metadata : {},
        });
      }

      if (complete) {
        await tx.componentVariant.deleteMany({ where: keys.length ? { NOT: { OR: keys } } : undefined });
      }
      for (const [sortOrder, entry] of entries.entries()) {
        const { componentId, role, detail, id: publicId, source, sourceFile, svg } = entry;
        const key = { componentId, role, detail };
        const data = { publicId, source, sourceFile, svg, sortOrder };
        await tx.componentVariant.upsert({
          where: { componentId_role_detail: key }, create: { ...key, ...data }, update: data,
        });
      }

      if (complete) await tx.component.deleteMany({ where: { variants: { none: {} } } });
    }, { timeout: 30_000 });
  }
}
