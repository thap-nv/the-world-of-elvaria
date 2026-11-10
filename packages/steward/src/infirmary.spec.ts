// The reason of an infirmary line is built from its trip and detail (P1-32), as the Steward wrote it before: the bell,
// the chronicle and the specs that read it see the same words. A refused patch reads back from either form.
import { describe, expect, it } from 'vitest';

import {
  APPRENTICE_LEFT,
  OUT_OF_ATTEMPTS,
  infirmaryData,
  infirmaryReason,
  pathsSaid,
  refusedPatchOf,
} from './infirmary.ts';
import type { InfirmaryCause } from './infirmary.ts';
import type { QuestId } from '@elvaria/domain';

const FOLLOW_UP = 'q_20261109_k3m9xz' as QuestId;
const WIP = ' (WIP not committed, it stays in the plot: index.lock exists)';

describe('infirmaryReason', () => {
  it.each<[string, InfirmaryCause, string]>([
    ['attempts that ran out', OUT_OF_ATTEMPTS, 'max_attempts'],
    ['a CLI that stopped at its own limit', { trip: 'turns' }, 'breaker:turns'],
    ['a breaker with words', { trip: 'time', detail: { message: 'ran 45 min' } }, 'breaker:time: ran 45 min'],
    [
      'a breaker whose WIP stayed in the plot, with an apprentice cut short',
      { trip: 'tokens', detail: { message: 'x', wip: 'index.lock exists', apprentice_left: true } },
      `breaker:tokens: x${WIP}${APPRENTICE_LEFT}`,
    ],
    [
      'a refused patch',
      { trip: 'commit', detail: { patch: 'it does not apply' } },
      'breaker:commit: elvaria.patch was not applied: it does not apply',
    ],
    [
      'missing secrets',
      { trip: 'secrets', detail: { message: 'no npm_token' } },
      'breaker:secrets: no npm_token',
    ],
    [
      'a forbidden path a program of the session wrote (P1-49)',
      { trip: 'forbidden_paths', detail: { paths: ['infra/secrets/key.txt', '.env'] } },
      "breaker:forbidden_paths: infra/secrets/key.txt, .env changed in the plot, which laws.forbidden_paths forbids, so nothing was committed: put them back or remove them in the plot before a retry; a program the session's shell ran wrote them (an interpreter such as node, pnpm or npx in the class's tools.allow opens every path to the character's scripts)",
    ],
    [
      'a review no verifier could finish',
      { trip: 'turns', detail: { verifiers_stopped: 2 } },
      'breaker:turns; 2 verifiers of run 3 left without a verdict, so no further one opens: raise the budget (quest edit) before a retry',
    ],
    [
      'a review whose judges handed in no verdict (P1-33)',
      {
        trip: 'no_verdict',
        detail: { message: 'the session ended error, exit code 1', verifiers_stopped: 2 },
      },
      'review:no_verdict: the session ended error, exit code 1; 2 verifiers of run 3 left without a verdict, so no further one opens: see why in the log, and give the review a judge that hands in a verdict before a retry',
    ],
    [
      'a review whose judges only ever read in part (P1-42)',
      {
        trip: 'partial_verdicts',
        detail: { message: 'the last judge stopped at break_and_expect_red', partial_verdicts: 3 },
      },
      "review:partial_verdicts: the last judge stopped at break_and_expect_red; 3 verifiers of run 3 handed in a partial verdict, so no further one opens: read their notes, and make sure the next judge can finish the ritual (run the checks' commands, name its breaks), before a retry",
    ],
    [
      'a script that broke',
      { trip: 'script_broken', detail: { message: 'exit 1', script: 'lint' } },
      'script:broken: exit 1',
    ],
    [
      'a script given bad params',
      { trip: 'script_usage', detail: { message: 'no url' } },
      'script:usage: no url',
    ],
    [
      'a script that failed',
      { trip: 'script_fail', detail: { script: 'link-check' } },
      'script:fail: link-check did not pass, see the verdict',
    ],
    [
      'a script that failed and opened its follow-up',
      { trip: 'script_fail', detail: { script: 'link-check', follow_up: FOLLOW_UP } },
      `script:fail: link-check did not pass, see the verdict; follow-up quest ${FOLLOW_UP} opened`,
    ],
    [
      'a script fail that lost its script',
      { trip: 'script_fail' },
      'script:fail: the script did not pass, see the verdict',
    ],
  ])('says %s', (_, cause, reason) => {
    expect(infirmaryReason(cause, 3)).toBe(reason);
  });
});

describe('pathsSaid (P1-49)', () => {
  it('names ten paths at most and counts the rest', () => {
    const paths = Array.from({ length: 12 }, (_, index) => `infra/secrets/${index}.key`);
    expect(pathsSaid(paths)).toBe(`${paths.slice(0, 10).join(', ')} and 2 more`);
    expect(pathsSaid(paths.slice(0, 10))).toBe(paths.slice(0, 10).join(', '));
  });
});

describe('infirmaryData', () => {
  it('carries the trip and the detail beside the reason', () => {
    const cause: InfirmaryCause = { trip: 'commit', detail: { patch: 'it does not apply' } };
    expect(infirmaryData(cause, 1)).toEqual({
      reason: 'breaker:commit: elvaria.patch was not applied: it does not apply',
      trip: 'commit',
      detail: { patch: 'it does not apply' },
    });
  });

  it.each<InfirmaryCause>([
    OUT_OF_ATTEMPTS,
    { trip: 'turns', detail: {} },
    // A hook or a WIP commit refused without a word: '' would fail the event schema.
    { trip: 'commit', detail: { message: '', wip: '' } },
  ])('leaves out a detail that says nothing: %j', (cause) => {
    expect(infirmaryData(cause, 1)).toEqual({ reason: infirmaryReason(cause, 1), trip: cause.trip });
  });

  it('drops the empty words and keeps the others, in the data and the reason alike', () => {
    const cause: InfirmaryCause = { trip: 'script_broken', detail: { message: '', script: 'lint' } };
    expect(infirmaryData(cause, 1)).toEqual({
      reason: 'script:broken',
      trip: 'script_broken',
      detail: { script: 'lint' },
    });
  });
});

describe('refusedPatchOf', () => {
  const why = 'it touches src/app.ts, outside laws.patch_paths (.husky/**)';
  const legacy = `breaker:commit: elvaria.patch was not applied: ${why}`;

  it('reads why from the detail of a line written since P1-32', () => {
    const line = infirmaryData({ trip: 'commit', detail: { patch: why, apprentice_left: true } }, 1);
    expect(refusedPatchOf(line)).toBe(why);
  });

  it("reads why from an older line's reason, without the note for the owner", () => {
    expect(refusedPatchOf({ reason: legacy })).toBe(why);
    expect(refusedPatchOf({ reason: `${legacy}${APPRENTICE_LEFT}` })).toBe(why);
  });

  it.each([
    { reason: 'breaker:commit: husky - pre-commit script failed' },
    { reason: 'breaker:time: elvaria.patch was not applied: it does not apply' },
    { reason: 'max_attempts' },
    // A trip is the whole truth: a hook's words that look like a refusal are not one.
    { reason: legacy, trip: 'commit', detail: { message: `elvaria.patch was not applied: ${why}` } },
  ] as const)('is undefined for any other cause: %j', (line) => {
    expect(refusedPatchOf(line)).toBeUndefined();
  });
});
