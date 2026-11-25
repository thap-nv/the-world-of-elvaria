// kingdom.heal: one heal per run (ADR 0034, plans/healer.md 4.4 and 5), out of kingdom.ts to keep it under the size
// limit. Optional with every key defaulted, so a kingdom file written before it stays valid at version 1.
import { z } from 'zod';

import { HEAL_DEFAULTS } from '../constants.ts';

const describe = (description: string) => ({ description });

export const HealSchema = z
  .strictObject({
    enabled: z
      .boolean()
      .default(HEAL_DEFAULTS.enabled)
      .meta(
        describe(
          "A submit commit the territory's hooks refused (breaker:commit, breaker:commit_errors) goes back once per run for a heal, with no bell, instead of to the infirmary. false: every refusal goes to the infirmary.",
        ),
      ),
    tokens: z
      .int()
      .min(1)
      .default(HEAL_DEFAULTS.tokens)
      .meta(
        describe(
          "A heal session's nominal token ceiling, in place of the quest's; breakers.soft_pct and hard_pct apply to it.",
        ),
      ),
    minutes: z
      .number()
      .positive()
      .default(HEAL_DEFAULTS.minutes)
      .meta(describe("A heal session's nominal time ceiling, in place of the quest's.")),
    max_files: z
      .int()
      .min(1)
      .default(HEAL_DEFAULTS.max_files)
      .meta(describe('The most files a healer may change in the staged work (K8).')),
    max_lines: z
      .int()
      .min(1)
      .default(HEAL_DEFAULTS.max_lines)
      .meta(describe('The most lines a healer may change in the staged work (K8).')),
  })
  .prefault({});
