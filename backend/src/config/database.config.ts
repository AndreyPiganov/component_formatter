export function readDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;

  const host = process.env.DATABASE_HOST || '127.0.0.1';
  const port = process.env.DATABASE_PORT || process.env.POSTGRES_PORT || '5433';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'component_formatter_local');
  return 'postgresql://component_formatter:' + password + '@' + host + ':' + port + '/component_formatter';
}
