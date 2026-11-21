export interface CatalogComponent {
  id: string;
  name: string;
  role: 'main' | 'background';
  tags: string[];
}

export function readCatalogComponent(value: unknown): CatalogComponent | undefined {
  if (!value || typeof value !== 'object') return;
  const { id, name, role, tags = [] } = value as Partial<CatalogComponent>;
  if (typeof id !== 'string' || !/^[a-z\d][a-z\d_-]{0,63}$/i.test(id) ||
      typeof name !== 'string' || !name.trim() || name.length > 160 ||
      (role !== 'main' && role !== 'background') || !Array.isArray(tags) || tags.length > 24 ||
      tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) {
    return;
  }
  return { id, name: name.trim(), role, tags };
}
