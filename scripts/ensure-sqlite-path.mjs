import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

function extractSqlitePath(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) {
    return null;
  }

  let raw = databaseUrl.slice('file:'.length);

  if (raw.startsWith('//')) {
    try {
      raw = decodeURIComponent(new URL(databaseUrl).pathname);
    } catch {
      // Fall back to raw parsing below.
    }
  }

  const clean = raw.split('?')[0]?.split('#')[0]?.trim();
  if (!clean) {
    return null;
  }

  return path.isAbsolute(clean) ? clean : path.resolve(process.cwd(), clean);
}

async function ensureSqlitePath() {
  const dbPath = extractSqlitePath(process.env.DATABASE_URL ?? '');
  if (!dbPath) {
    return;
  }

  const dir = path.dirname(dbPath);
  await mkdir(dir, { recursive: true });
  const handle = await open(dbPath, 'a');
  await handle.close();
  console.log(`SQLite path ready: ${dbPath}`);
}

ensureSqlitePath().catch((error) => {
  console.error('Failed to prepare SQLite path:', error);
  process.exit(1);
});
