// `data` of `agent.session.usage` (PS-28, docs/plans/session-stamina.md): a running session's stamina, written by the
// Steward for an assignee and a judge alike each time the session's bar crosses a notch (STAMINA_STEP_PCT of the way to
// `hard_pct`), or the ceiling of its gauge changes. Unlike `agent.session.wrap_up` (the reminder was written, once, an
// assignee's only, with `wrap-up.json`), it is a measure: many per session, no file, nothing the session sees. The
// thresholds ride on the line so a reader draws the bar without kingdom.json (`barOf`). A type new to v1's catalogue,
// so no migration: a pinned build older than it keeps the line and ignores it (ADR 0003).
import { z } from 'zod';

import { RoleSchema } from '../common.ts';

const describe = (description: string) => ({ description });
const PctSchema = z.number().positive();

export const AgentSessionUsageDataSchema = z
  .strictObject({
    role: RoleSchema.meta(
      describe("Whose session: an assignee's bar has the reminder mark, a judge's none."),
    ),
    measure: z
      .enum(['time', 'tokens', 'turns'])
      .meta(describe('The gauge the bar follows: of the ones the breakers read, the nearest its cut.')),
    used: z.number().min(0).meta(describe('Minutes for `time`, as on `agent.session.wrap_up`.')),
    limit: z
      .number()
      .positive()
      .meta(
        describe(
          'Nominal ceiling in force, before the soft and hard percentages: tokenCeilingOf for tokens (the tribe calibrated, a judge times verifier_tokens_multiplier), budget.max_minutes for time.',
        ),
      ),
    pct: z.number().min(0).meta(describe('Used as a percentage of the nominal ceiling.')),
    soft_pct: PctSchema.meta(describe('breakers.soft_pct in force: the reminder mark of the bar.')),
    hard_pct: PctSchema.meta(
      describe('breakers.hard_pct in force: the bar is empty here, where the session is cut.'),
    ),
  })
  .meta(
    describe(
      "A notch of the session's stamina bar (PS-28): the bar is what is left of the way to the cut, not of the work, and is never stored; readers fold these lines (sessionStaminaOf).",
    ),
  );
