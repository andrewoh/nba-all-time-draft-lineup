import { PrismaClient } from '@prisma/client';
import path from 'node:path';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function defaultDatabaseUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    return 'file:/var/data/dev.db';
  }

  return 'file:./dev.db';
}

function looksLikeProtocol(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function toFileUrlFromPath(pathValue: string): string {
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

function normalizeDatabaseUrl(input: string | undefined): string {
  const raw = String(input ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) {
    return defaultDatabaseUrl();
  }

  if (raw.startsWith('file:')) {
    return raw;
  }

  if (raw.startsWith('sqlite:')) {
    return toFileUrlFromPath(raw.slice('sqlite:'.length));
  }

  if (!looksLikeProtocol(raw)) {
    return toFileUrlFromPath(raw);
  }

  return defaultDatabaseUrl();
}

const normalizedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (process.env.DATABASE_URL !== normalizedDatabaseUrl) {
  process.env.DATABASE_URL = normalizedDatabaseUrl;
}

export const db =
  global.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: normalizedDatabaseUrl
      }
    }
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = db;
}
