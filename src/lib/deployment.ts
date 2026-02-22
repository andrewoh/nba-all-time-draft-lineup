export function usesEphemeralDatabase(): boolean {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  return databaseUrl.startsWith('file:/tmp/') || databaseUrl.includes('/tmp/');
}
