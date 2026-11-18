// `data` of `tribe.checked` (run (221) (b)): `elvaria tribe check` against a tribe's real CLI opens sessions on the
// tribe's account, and a server with no room let two checks of gemini run 15 and 34 minutes while nothing counted their
// tokens. The CLI writes this line (actor `user`), as it writes upgrade.*, with what the sessions reported; the
// Steward's mana estimate counts it as it counts a quest's sessions (ADR 0009: summed usage against the budget).
import { z } from 'zod';

import { TribeIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';

const describe = (description: string) => ({ description });
// The pattern of ModelSlugSchema (common.ts) without its `id`, for the reason event-data.ts gives.
const ModelSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
const TokensSchema = z.int().min(0);

export const TRIBE_CHECK_OUTCOMES = ['passed', 'skipped', 'failed'] as const;

const CheckedSchema = z.strictObject({
  check: NonEmptyStringSchema.meta(
    describe('The id of a check of the conformance suite (`submit`, `hang`…).'),
  ),
  outcome: z.enum(TRIBE_CHECK_OUTCOMES),
  tokens: TokensSchema.meta(
    describe('What its sessions reported, passed or failed; 0 for a check that opens no session.'),
  ),
});

export const TribeCheckedDataSchema = z
  .strictObject({
    tribe: TribeIdSchema.meta(describe('TribeId from kingdom.tribes[].')),
    model: ModelSlugSchema.meta(describe('The model the sessions ran on: its pool is the one they drew on.')),
    outcome: z.enum(['passed', 'failed']).meta(describe('Whether every check passed or was skipped.')),
    tokens: TokensSchema.meta(describe('The sum of `checks[].tokens`.')),
    checks: z.array(CheckedSchema),
  })
  .meta(
    describe(
      "`elvaria tribe check` ran the conformance suite against the real CLI of `tribe` (never with `--scenarios`, a fake CLI that spends nothing). The mana estimate counts `tokens` against the pool of `model` at the line's time, as a session of a quest; a probe's model call reports no tokens and is not in them.",
    ),
  );
