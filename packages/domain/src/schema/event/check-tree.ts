// The fields that make one run of a check a fact about a git tree (RC-03, ADR 0035, plans/recheck.md §2.1, §3), on
// `check.end` and `patrol.ran` (later `train.ran`): the tree it ran on, the fingerprint of the commands it ran, and, on
// a carried check, the line of the run whose green it stands for. All optional and added in v2: a line without them is
// no fact the check ledger keeps, so older logs still read, `v` stays 2 and nothing migrates (ADR 0003).
import { z } from 'zod';

import { UlidSchema } from '../../core/ids.ts';

const describe = (description: string) => ({ description });

/** Hex digits of `config`: a sha256 cut short, which runner-core's checkConfigOf computes. */
export const CHECK_CONFIG_LENGTH = 16;

export const TreeIdSchema = z
  .string()
  .regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/)
  .meta(
    describe(
      "The tree of the commit checked (`git rev-parse <commit>^{tree}`): a forge's merge commit and the queue's trial merge of the same content share it (ADR 0035). Absent: the plot had uncommitted changes, the territory has no git, or the line is older than RC-03; its checks are then no fact the check ledger keeps.",
    ),
  );

export const CheckConfigSchema = z
  .string()
  .regex(new RegExp(`^[0-9a-f]{${String(CHECK_CONFIG_LENGTH)}}$`))
  .meta(
    describe(
      "The fingerprint of the territory's commands.setup and of each check's id, run and narrow when the checks ran (sha256, cut short): a green check is carried only under the same one, so an owner's edit of a command expires every earlier green of the territory (ADR 0035).",
    ),
  );

export const CarriedFromSchema = UlidSchema.meta(
  describe(
    'The check did not run: the Steward carried it (ADR 0035), green with the same command on this very tree in the line this names, the run itself; so it passed and took no time.',
  ),
);

/** A carried check passed and took no time: it never ran (plans/recheck.md §3). */
export const carriedPassed = (check: {
  readonly carried_from?: string | undefined;
  readonly pass: boolean;
  readonly duration_ms: number;
}): boolean => check.carried_from === undefined || (check.pass && check.duration_ms === 0);

export const CARRIED_PASSED = 'a carried check passed and took no time';
