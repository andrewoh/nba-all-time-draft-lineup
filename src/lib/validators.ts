import { z } from 'zod';
import {
  GROUP_CODE_MAX_LENGTH,
  SEED_MAX_LENGTH,
  USER_NAME_MAX_LENGTH
} from '@/lib/constants';
import { LINEUP_SLOTS } from '@/lib/types';

export const startGameSchema = z.object({
  userName: z.string().max(USER_NAME_MAX_LENGTH).optional(),
  groupCode: z.string().max(GROUP_CODE_MAX_LENGTH).optional(),
  seed: z.string().max(SEED_MAX_LENGTH).optional()
});

export const draftPickSchema = z.object({
  playerName: z.string().min(1).max(80),
  slot: z.enum(LINEUP_SLOTS)
});
