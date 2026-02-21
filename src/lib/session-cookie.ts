import { cookies } from 'next/headers';
import { DRAFT_SESSION_COOKIE } from '@/lib/constants';

export function getDraftSessionCookieToken(): string | null {
  return cookies().get(DRAFT_SESSION_COOKIE)?.value ?? null;
}

export function setDraftSessionCookieToken(cookieToken: string) {
  cookies().set(DRAFT_SESSION_COOKIE, cookieToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12
  });
}

export function clearDraftSessionCookieToken() {
  cookies().delete(DRAFT_SESSION_COOKIE);
}
