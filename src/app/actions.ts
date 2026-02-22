'use server';

import { redirect } from 'next/navigation';
import { createDraftSession, submitDraftPick } from '@/lib/draft-service';
import {
  clearDraftSessionCookieToken,
  getDraftSessionCookieToken,
  setDraftSessionCookieToken
} from '@/lib/session-cookie';
import { draftPickSchema, startGameSchema } from '@/lib/validators';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export async function startGameAction(formData: FormData) {
  let destination = '/draft';

  try {
    const parsed = startGameSchema.parse({
      userName: formData.get('userName')?.toString() ?? '',
      groupCode: formData.get('groupCode')?.toString() ?? '',
      seed: formData.get('seed')?.toString() ?? ''
    });

    const session = await createDraftSession({
      userName: parsed.userName,
      groupCode: parsed.groupCode,
      seed: parsed.seed
    });

    setDraftSessionCookieToken(session.cookieToken);
  } catch (error) {
    destination = `/?error=${encodeURIComponent(getErrorMessage(error))}`;
  }

  redirect(destination);
}

export async function submitPickAction(formData: FormData) {
  let destination = '/draft';

  try {
    const cookieToken = getDraftSessionCookieToken();
    if (!cookieToken) {
      throw new Error('Draft session expired. Start a new game.');
    }

    const parsed = draftPickSchema.parse({
      playerName: formData.get('playerName')?.toString() ?? '',
      slot: formData.get('slot')?.toString() ?? ''
    });

    const result = await submitDraftPick({
      cookieToken,
      playerName: parsed.playerName,
      slot: parsed.slot
    });

    if (result.completed) {
      if (!result.shareCode) {
        throw new Error('Run completed but no share code was generated.');
      }

      destination = `/results/${result.shareCode}`;
    }
  } catch (error) {
    destination = `/draft?error=${encodeURIComponent(getErrorMessage(error))}`;
  }

  redirect(destination);
}

export async function resetGameAction() {
  clearDraftSessionCookieToken();
  redirect('/');
}

export async function resetGameWithPrefillAction(formData: FormData) {
  const userName = formData.get('userName')?.toString().trim() ?? '';
  const groupCode = formData.get('groupCode')?.toString().trim() ?? '';
  const seed = formData.get('seed')?.toString().trim() ?? '';

  const query = new URLSearchParams();
  if (userName) {
    query.set('userName', userName);
  }
  if (groupCode) {
    query.set('groupCode', groupCode);
  }
  if (seed) {
    query.set('seed', seed);
  }

  clearDraftSessionCookieToken();
  const queryString = query.toString();
  redirect(queryString ? `/?${queryString}` : '/');
}
