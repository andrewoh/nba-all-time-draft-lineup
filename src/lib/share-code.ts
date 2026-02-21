import {
  GROUP_CODE_MAX_LENGTH,
  SEED_MAX_LENGTH,
  SHARE_CODE_LENGTH,
  USER_NAME_MAX_LENGTH
} from '@/lib/constants';

const SHARE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateShareCode(length = SHARE_CODE_LENGTH, rng: () => number = Math.random): string {
  let code = '';

  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(rng() * SHARE_ALPHABET.length);
    code += SHARE_ALPHABET[index];
  }

  return code;
}

export function normalizeGroupCode(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, GROUP_CODE_MAX_LENGTH);
}

export function normalizeSeed(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw.trim();
  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, SEED_MAX_LENGTH);
}

export function normalizeUserName(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 ._'-]/g, '');

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, USER_NAME_MAX_LENGTH);
}
