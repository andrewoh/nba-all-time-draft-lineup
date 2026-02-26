import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

function defaultDatabaseUrl() {
  if (process.env.NODE_ENV === 'production') {
    return 'file:/var/data/dev.db';
  }

  return 'file:./dev.db';
}

function looksLikeProtocol(value) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function toFileUrlFromPath(pathValue) {
  const trimmed = pathValue.trim();
  const baseDir =
    process.env.NODE_ENV === 'production'
      ? process.env.SQLITE_MOUNT_PATH?.trim() || '/var/data'
      : process.cwd();

  const targetPath = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(baseDir, trimmed || 'dev.db');

  return `file:${targetPath}`;
}

function normalizeDatabaseUrl(rawValue) {
  const raw = String(rawValue ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) {
    return defaultDatabaseUrl();
  }

  if (raw.startsWith('file:')) {
    return raw;
  }

  if (!looksLikeProtocol(raw)) {
    return toFileUrlFromPath(raw);
  }

  if (raw.startsWith('sqlite:')) {
    const sqlitePath = raw.slice('sqlite:'.length);
    return toFileUrlFromPath(sqlitePath);
  }

  const fallback = defaultDatabaseUrl();
  console.warn(
    `Unsupported DATABASE_URL protocol for SQLite datasource (${raw}). Falling back to ${fallback}.`
  );
  return fallback;
}

function extractSqlitePath(databaseUrl) {
  if (!databaseUrl.startsWith('file:')) {
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

async function ensureSqlitePath(databaseUrl) {
  const dbPath = extractSqlitePath(databaseUrl);
  if (!dbPath) {
    return;
  }

  const dir = path.dirname(dbPath);
  await mkdir(dir, { recursive: true });
  const handle = await open(dbPath, 'a');
  await handle.close();
  console.log(`SQLite path ready: ${dbPath}`);
}

async function runPrismaMigrateDeploy() {
  const prismaBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'prisma');
  await new Promise((resolve, reject) => {
    const child = spawn(prismaBin, ['migrate', 'deploy'], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`prisma migrate deploy exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  const normalizedUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  process.env.DATABASE_URL = normalizedUrl;
  console.log(`Using DATABASE_URL=${normalizedUrl}`);
  await ensureSqlitePath(normalizedUrl);

  if (process.argv.includes('--migrate-deploy')) {
    await runPrismaMigrateDeploy();
  }
}

main().catch((error) => {
  console.error('Failed to prepare SQLite path:', error);
  process.exit(1);
});
