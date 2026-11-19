import { describe, expect, it } from 'vitest';

import { questId, questOf, verdictOf } from './__fixtures__/ledger.ts';
import { THORN, ledgerOf, opening, ref, runsOf } from './__fixtures__/lessons.ts';
import { lessonEvidenceOf } from './lesson-runs.ts';
import { repeatedFailuresOf } from './repeated-failures.ts';
import type { LooseOf } from './__fixtures__/lessons.ts';
import type { EvidenceRun } from './lesson-runs.ts';
import type { FailKind } from '../schema/common.ts';

/** A failed run: its verdict is `<quest>-1`, as the fixtures name it. */
const failed = (index: number, kind: FailKind, over: LooseOf<EvidenceRun> = {}): LooseOf<EvidenceRun> => ({
  result: 'fail',
  fail_kind: kind,
  verdict: `${questId(index + 1)}-1`,
  ...over,
});

const PASS: LooseOf<EvidenceRun> = { result: 'pass' };

describe('repeatedFailuresOf (PS-12b)', () => {
  it('groups the failures of one kind from three verdicts on, and carries who, where and which lessons', () => {
    const runs = runsOf(6, (index) =>
      index % 2 === 0
        ? failed(index, 'style', {
            tribe: index === 4 ? 'codex' : 'claude',
            model: `model-${index}`,
            tags: ['docs'],
            lessons: [ref('aaaaaa')],
          })
        : PASS,
    );
    expect(repeatedFailuresOf({ runs, judgements: [] })).toEqual([
      {
        fail_kind: 'style',
        members: [
          {
            verdict: `${questId(1)}-1`,
            quest: questId(1),
            n: 1,
            class: 'knight',
            tribe: 'claude',
            model: 'model-0',
            territory: 'dc1-se-team',
            tags: ['docs'],
            lessons: [ref('aaaaaa')],
          },
          {
            verdict: `${questId(3)}-1`,
            quest: questId(3),
            n: 1,
            class: 'knight',
            tribe: 'claude',
            model: 'model-2',
            territory: 'dc1-se-team',
            tags: ['docs'],
            lessons: [ref('aaaaaa')],
          },
          {
            verdict: `${questId(5)}-1`,
            quest: questId(5),
            n: 1,
            class: 'knight',
            tribe: 'codex',
            model: 'model-4',
            territory: 'dc1-se-team',
            tags: ['docs'],
            lessons: [ref('aaaaaa')],
          },
        ],
      },
    ]);
  });

  it('needs three verdicts: two of a kind are not a repeat', () => {
    const runs = runsOf(4, (index) => (index < 2 ? failed(index, 'unsafe') : PASS));
    expect(repeatedFailuresOf({ runs, judgements: [] })).toEqual([]);
    const three = runsOf(4, (index) => (index < 3 ? failed(index, 'unsafe') : PASS));
    expect(repeatedFailuresOf({ runs: three, judgements: [] }).map(({ fail_kind }) => fail_kind)).toEqual([
      'unsafe',
    ]);
  });

  it('reads the 50 most recent judged runs: a failure older than that is no longer a repeat', () => {
    // Failures at runs 0, 1 and 2, then 49 passes: the window of 50 holds the last of the three only.
    const runs = runsOf(52, (index) => (index < 3 ? failed(index, 'tests_fail') : PASS));
    expect(repeatedFailuresOf({ runs, judgements: [] })).toEqual([]);
    // Runs 2 to 51 hold the failure of run 2 and one of run 40: two, still no repeat.
    const slid = runsOf(52, (index) => (index < 3 || index === 40 ? failed(index, 'tests_fail') : PASS));
    expect(repeatedFailuresOf({ runs: slid, judgements: [] })).toEqual([]);
    // And a third and a fourth at the very end: run 2 is the oldest the window keeps, and it counts.
    const held = runsOf(52, (index) => (index === 2 || index > 48 ? failed(index, 'tests_fail') : PASS));
    expect(repeatedFailuresOf({ runs: held, judgements: [] })[0]?.members).toHaveLength(4);
  });

  it('does not count a run no verdict decided toward the 50', () => {
    const undecided = runsOf(10, () => ({}), 3);
    const runs = [
      ...runsOf(3, (index) => failed(index, 'style')),
      ...undecided,
      ...runsOf(47, () => PASS, 13),
    ];
    // 3 + 47 judged runs fill the window exactly; the ten undecided ones sit between and take no place.
    expect(repeatedFailuresOf({ runs, judgements: [] }).map(({ fail_kind }) => fail_kind)).toEqual(['style']);
  });

  it('leaves out a flaky check: it says nothing of the work', () => {
    const runs = runsOf(5, (index) => failed(index, 'flaky'));
    expect(repeatedFailuresOf({ runs, judgements: [] })).toEqual([]);
  });

  it('lists the biggest group first, equal ones by the name of the kind', () => {
    const kinds: FailKind[] = [
      'style',
      'unsafe',
      'unsafe',
      'incomplete',
      'style',
      'unsafe',
      'incomplete',
      'incomplete',
      'style',
      'style',
    ];
    const runs = runsOf(kinds.length, (index) => failed(index, kinds[index] ?? 'other'));
    expect(
      repeatedFailuresOf({ runs, judgements: [] }).map(({ fail_kind, members }) => [
        fail_kind,
        members.length,
      ]),
    ).toEqual([
      ['style', 4],
      ['incomplete', 3],
      ['unsafe', 3],
    ]);
  });

  describe('from the ledger', () => {
    /** Quest `n`: run 1 failed by its judge with `style` (id q-n-1). */
    const styleFail = (n: number) => ({
      quest: questOf(n, [{ n: 1, start: 0, end: 5, session: `a${n}` }]),
      verdict: verdictOf(n, 1, 'fail', { fail_kind: 'style', minute: 6 }),
      line: opening(n, { session: `a${n}`, attempts: 1, minute: 0, lessons: [ref('aaaaaa')] }),
    });

    it('leaves out a fail the owner rejudged: the judge erred, so the run is no style failure', () => {
      const failing = [1, 2].map(styleFail);
      // Quest 3: the judge passed it and the owner returned it with `rejudge`.
      const third = {
        quest: questOf(3, [{ n: 1, start: 0, end: 5, session: 'a3' }]),
        verdicts: [
          verdictOf(3, 1, 'pass', { minute: 6 }),
          verdictOf(3, 1, 'fail', { owner: true, fail_kind: 'style', minute: 7, rejudge: true }),
        ],
        line: opening(3, { session: 'a3', attempts: 1, minute: 0 }),
      };
      const input = ledgerOf({
        quests: [...failing.map(({ quest }) => quest), third.quest],
        verdicts: [...failing.map(({ verdict }) => verdict), ...third.verdicts],
        events: [...failing.map(({ line }) => line), third.line],
        characters: [THORN],
      });
      // Two style failures and a rejudged return: counted as a failure it would be the third and a repeat.
      expect(repeatedFailuresOf(lessonEvidenceOf(input))).toEqual([]);
      const fourth = styleFail(4);
      const more = ledgerOf({
        quests: [...input.quests, fourth.quest],
        verdicts: [...input.verdicts, fourth.verdict],
        events: [...input.events, fourth.line],
        characters: [THORN],
      });
      const [group] = repeatedFailuresOf(lessonEvidenceOf(more));
      expect(group?.members.map(({ quest, lessons }) => [quest, lessons])).toEqual([
        [questId(1), [ref('aaaaaa')]],
        [questId(2), [ref('aaaaaa')]],
        [questId(4), [ref('aaaaaa')]],
      ]);
    });
  });
});
