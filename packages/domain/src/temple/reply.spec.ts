import { describe, expect, it } from 'vitest';

import { TempleReportPayloadSchema } from '../schema/temple/operation.ts';
import { TempleReplySchema } from '../schema/temple/reply.ts';
import { failure, line, source, verdictId } from './__fixtures__/evidence.ts';
import { templeEvidenceOf } from './evidence.ts';
import { templeCommands, templeReplyIssues } from './reply.ts';
import type { CharacterId } from '../core/ids.ts';
import type { LessonCount } from '../metrics/lesson-counts.ts';
import type { TempleReply } from '../schema/temple/reply.ts';

const MONK = 'brother-oak' as CharacterId;
const REVIEWED = 'L_20261119_aaaaaa';

const evidence = templeEvidenceOf(
  source({
    failures: [
      failure('incomplete', 3, 1),
      failure('wrong_facts', 3, 10),
      failure('style', 3, 20),
      failure('unsafe', 3, 30),
    ],
    lines: [line({ ref: REVIEWED })],
    counts: [
      { ref: REVIEWED, fail_kind: 'tests_fail', loads: 20, helped: 5, missed: 15 } as unknown as LessonCount,
    ],
  }),
);

const reply = (body: unknown): TempleReply => TempleReplySchema.parse({ version: 1, ...(body as object) });

const decisions = [
  {
    group: 'incomplete',
    rung: 'scripture',
    why: 'Three runs stopped before the README.',
    lesson: {
      owner: 'thorn',
      scope: { role: ['assignee'] },
      text: 'Update the README before you hand in.',
      source_verdict: verdictId(2),
    },
  },
  {
    group: 'wrong_facts',
    rung: 'knowledge',
    why: 'Only this territory has the rule.',
    lesson: {
      owner: 'temple',
      scope: { territory: ['elvaria'] },
      text: 'Read CLAUDE.md first.',
      source_verdict: verdictId(10),
    },
  },
  {
    group: 'style',
    rung: 'check',
    why: 'A lint rule catches it.',
    letter: { source_verdict: verdictId(20), body: 'Add a lint rule.' },
  },
  {
    group: 'unsafe',
    rung: 'model',
    why: 'A stronger model.',
    letter: { source_verdict: verdictId(31), body: 'Move knights to opus.' },
  },
];

describe('TempleReplySchema (PS-12d)', () => {
  it('takes a letter on rungs 1–3 and 6, a line on rungs 4–5, nothing on none', () => {
    expect(reply({ decisions }).decisions).toHaveLength(4);
    expect(reply({ decisions: [{ group: 'style', rung: 'none', why: 'Not enough yet.' }] }).reviews).toEqual(
      [],
    );
  });

  it.each([
    [
      'a letter rung with a line',
      { group: 'style', rung: 'check', why: 'w', lesson: decisions[0]?.lesson },
      'letter',
    ],
    ['a letter rung with both', { ...decisions[2], lesson: decisions[0]?.lesson }, 'letter'],
    [
      'a line rung with a letter',
      { group: 'style', rung: 'scripture', why: 'w', letter: decisions[2]?.letter },
      'lesson',
    ],
    ['a line rung with both', { ...decisions[0], letter: decisions[2]?.letter }, 'lesson'],
    [
      'rung none with a letter',
      { group: 'style', rung: 'none', why: 'w', letter: decisions[2]?.letter },
      'rung',
    ],
    [
      'knowledge in a character file',
      { ...decisions[1], lesson: { ...decisions[1]?.lesson, owner: 'thorn' } },
      'lesson',
    ],
    [
      'knowledge with no territory',
      { ...decisions[1], lesson: { ...decisions[1]?.lesson, scope: { tag: ['docs'] } } },
      'lesson',
    ],
  ])('refuses %s', (_, decision, path) => {
    const parsed = TempleReplySchema.safeParse({ version: 1, decisions: [decision] });
    expect(parsed.error?.issues.map((issue) => issue.path.at(-1))).toEqual([path]);
  });
});

describe('templeReplyIssues (PS-12d)', () => {
  it('passes a reply that decides each group once with its own verdicts', () => {
    expect(templeReplyIssues(reply({ decisions }), evidence)).toEqual([]);
  });

  it('names a group decided twice, one left undecided, one outside the pack, a verdict of another group', () => {
    const twice = [
      decisions[0],
      { ...decisions[0], rung: 'none', lesson: undefined },
      decisions[2],
      decisions[3],
    ];
    expect(templeReplyIssues(reply({ decisions: twice }), evidence)).toEqual([
      { code: 'twice_decided', about: 'incomplete' },
      { code: 'undecided', about: 'wrong_facts' },
    ]);
    const outside = [...decisions, { group: 'flaky', rung: 'none', why: 'w' }];
    expect(templeReplyIssues(reply({ decisions: outside }), evidence)).toEqual([
      { code: 'unknown_group', about: 'flaky' },
    ]);
    const foreign = [
      { ...decisions[2], letter: { source_verdict: verdictId(1), body: 'b' } },
      decisions[0],
      decisions[1],
      decisions[3],
    ];
    expect(templeReplyIssues(reply({ decisions: foreign }), evidence)).toEqual([
      { code: 'foreign_verdict', about: verdictId(1) },
    ]);
  });

  it('refuses more than three lines and more than six letters', () => {
    const pack = templeEvidenceOf(
      source({
        failures: ['incomplete', 'wrong_facts', 'style', 'unsafe', 'tests_fail', 'other', 'scope_creep'].map(
          (kind, index) => failure(kind as never, 3, index * 10),
        ),
      }),
    );
    const lineOf = (group: string, index: number) => ({
      group,
      rung: 'scripture',
      why: 'w',
      lesson: { owner: 'temple', text: 't', source_verdict: verdictId(index * 10) },
    });
    const letterOf = (group: string, index: number) => ({
      group,
      rung: 'check',
      why: 'w',
      letter: { source_verdict: verdictId(index * 10), body: 'b' },
    });
    const groups = pack.groups.map(({ group }) => group);
    const lines = reply({
      decisions: groups.map((group, index) => (index < 4 ? lineOf(group, index) : letterOf(group, index))),
    });
    expect(templeReplyIssues(lines, pack)).toEqual([{ code: 'too_many_lines' }]);
    const letters = reply({ decisions: groups.map((group, index) => letterOf(group, index)) });
    expect(templeReplyIssues(letters, pack)).toEqual([{ code: 'too_many_letters' }]);
  });

  it('takes a review of a line the pack names, once', () => {
    const review = { lesson: REVIEWED, review: 'retire', why: 'Missed 15 of 20.' };
    expect(templeReplyIssues(reply({ decisions, reviews: [review] }), evidence)).toEqual([]);
    expect(templeReplyIssues(reply({ decisions, reviews: [review, review] }), evidence)).toEqual([
      { code: 'twice_reviewed', about: REVIEWED },
    ]);
    const unknown = { ...review, lesson: 'L_20261119_zzzzzz' };
    expect(templeReplyIssues(reply({ decisions, reviews: [unknown] }), evidence)).toEqual([
      { code: 'unknown_review', about: 'L_20261119_zzzzzz' },
    ]);
  });
});

describe('templeCommands (PS-12d)', () => {
  it("makes one temple_report the inbox takes: retirements first, lines with the group's kind, letters routed", () => {
    const review = { lesson: REVIEWED, review: 'retire', why: 'Missed 15 of 20.' };
    const made = templeCommands(reply({ decisions, reviews: [review] }), evidence, MONK);
    expect(made.ok).toBe(true);
    const payload = made.ok ? made.value : null;
    expect(TempleReportPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload).toEqual({
      character: MONK,
      operations: [
        { op: 'retire', lesson: REVIEWED, why: 'Missed 15 of 20.' },
        {
          op: 'add',
          owner: 'thorn',
          scope: { role: ['assignee'] },
          fail_kind: 'incomplete',
          text: 'Update the README before you hand in.',
          source_verdict: verdictId(2),
        },
        {
          op: 'add',
          owner: 'temple',
          scope: { territory: ['elvaria'] },
          fail_kind: 'wrong_facts',
          text: 'Read CLAUDE.md first.',
          source_verdict: verdictId(10),
        },
      ],
      letters: [
        {
          rung: 'check',
          to: 'chancellor',
          source_verdict: verdictId(20),
          body: 'Add a lint rule.',
          refs: [],
        },
        {
          rung: 'model',
          to: 'owner',
          source_verdict: verdictId(31),
          body: 'Move knights to opus.',
          refs: [],
        },
      ],
    });
  });

  it('writes a line without a scope as one for every session', () => {
    const bare = [
      {
        ...decisions[0],
        lesson: { owner: 'temple', text: 'Say what you did.', source_verdict: verdictId(1) },
      },
      ...decisions.slice(1),
    ];
    const made = templeCommands(reply({ decisions: bare }), evidence, MONK);
    expect(made.ok && made.value?.operations[0]).toEqual({
      op: 'add',
      owner: 'temple',
      fail_kind: 'incomplete',
      text: 'Say what you did.',
      source_verdict: verdictId(1),
    });
  });

  it("merges the Monk's lines a line replaces, which the inbox takes as one merge", () => {
    const merged = { ...decisions[0]?.lesson, replaces: [REVIEWED, 'L_20261119_bbbbbb'] };
    const made = templeCommands(
      reply({ decisions: [{ ...decisions[0], lesson: merged }, ...decisions.slice(1)] }),
      evidence,
      MONK,
    );
    expect(made.ok && made.value?.operations[0]).toEqual({
      op: 'merge',
      lessons: [REVIEWED, 'L_20261119_bbbbbb'],
      owner: 'thorn',
      scope: { role: ['assignee'] },
      fail_kind: 'incomplete',
      text: 'Update the README before you hand in.',
      source_verdict: verdictId(2),
    });
    expect(TempleReportPayloadSchema.safeParse(made.ok ? made.value : null).success).toBe(true);
    const one = { ...merged, replaces: [REVIEWED] };
    expect(
      TempleReplySchema.safeParse({ version: 1, decisions: [{ ...decisions[0], lesson: one }] }).success,
    ).toBe(false);
  });

  it('makes no command when nothing changes, and none from a reply the pack refuses', () => {
    const none = (['incomplete', 'wrong_facts', 'style', 'unsafe'] as const).map((group) => ({
      group,
      rung: 'none',
      why: 'w',
    }));
    const keep = { lesson: REVIEWED, review: 'keep', why: 'Too soon.' };
    expect(templeCommands(reply({ decisions: none, reviews: [keep] }), evidence, MONK)).toEqual({
      ok: true,
      value: null,
    });
    expect(templeCommands(reply({ decisions: none.slice(1) }), evidence, MONK)).toEqual({
      ok: false,
      error: { code: 'issues', issues: [{ code: 'undecided', about: 'incomplete' }] },
    });
  });
});
