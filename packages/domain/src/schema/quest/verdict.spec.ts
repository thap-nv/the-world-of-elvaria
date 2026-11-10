import { describe, expect, it } from 'vitest';

import examples from '../../../examples/verdict.json' with { type: 'json' };
import { VerdictSchema } from './verdict.ts';

const QUEST = 'q_20261106_7k3m2a';
const NOTES = 'Hai test đỏ trong `scoring/effective-level.spec.ts`; sửa rồi nộp lại.';

const pass = {
  version: 1,
  id: `${QUEST}-2`,
  quest_id: QUEST,
  attempt: 2,
  verifier_id: 'brann',
  ritual: 'build_review',
  checks: [{ id: 'lint', pass: true, duration_ms: 21400, log_path: `.runs/${QUEST}-2/checks/lint.log` }],
  result: 'pass',
  by_human: false,
  session_id: '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d',
  created_at: '2026-11-06T09:58:40+07:00',
};

const OWNER = { verifier_id: 'user', by_human: true, session_id: undefined };
const ID_ISSUE =
  "id: the verdict id is <quest_id>-<attempt>, with -p<k> on a partial verdict and -user on the owner's";

const issuesOf = (change: object) => {
  const result = VerdictSchema.safeParse({ ...pass, ...change });
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('VerdictSchema', () => {
  it.each(examples.map((example) => [example.id, example]))(
    'accepts the v1 example %s unchanged',
    (_, example) => {
      expect(VerdictSchema.parse(example)).toEqual(example);
    },
  );

  it.each([
    ['a judge pass', {}],
    ['a fail with specific notes', { result: 'fail', fail_kind: 'tests_fail', notes: NOTES }],
    [
      'a partial with progress',
      { result: 'partial', progress: { checked_until: 'docs/architecture.md#runner' } },
    ],
    ['a royal seal without session', OWNER],
    ['a machine verdict without session', { verifier_id: 'machine', session_id: undefined }],
    // P1-04: the judgements of one run keep a file each.
    ["the owner's verdict beside the judge's", { id: `${QUEST}-2-user`, ...OWNER }],
    [
      'a partial verdict of the second verifier session',
      { id: `${QUEST}-2-p2`, result: 'partial', progress: { checked_until: 'src/api/orders.ts' } },
    ],
    // P1-40: a judge in a scratch plot names its breaks; the owner may return a quest for a new judgement.
    [
      'a pass with its breaks',
      { notes: NOTES, breaks: [{ change: 'src/a.ts:3 returns 0', red: 'pnpm test: a.spec.ts failed' }] },
    ],
    [
      "the owner's return for a new judgement",
      { id: `${QUEST}-2-user`, ...OWNER, result: 'fail', fail_kind: 'other', notes: NOTES, rejudge: true },
    ],
    ['a verdict that says it is no rejudge', { rejudge: false }],
  ])('accepts %s', (_, change) => {
    expect(issuesOf(change)).toEqual([]);
  });

  it.each([
    ['an unknown field', { score: 9 }, 'Unrecognized key'],
    ['a verdict id without attempt', { id: QUEST }, 'id: '],
    ['attempt zero', { attempt: 0, id: `${QUEST}-0` }, 'attempt: '],
    ['an unknown result', { result: 'approved' }, 'result: '],
    ['an unknown fail kind', { result: 'fail', fail_kind: 'typo', notes: NOTES }, 'fail_kind: '],
    ['a negative duration', { checks: [{ ...pass.checks[0], duration_ms: -1 }] }, 'checks.0.duration_ms'],
    [
      'an empty progress mark',
      { result: 'partial', progress: { checked_until: '' } },
      'progress.checked_until',
    ],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf(change).join('\n')).toContain(expected);
  });

  it.each([
    [
      'a fail without notes',
      { result: 'fail', fail_kind: 'style' },
      'notes: a fail verdict needs specific notes (at least 20 characters)',
    ],
    [
      'a fail with a vague note',
      { result: 'fail', fail_kind: 'style', notes: 'Chưa đạt.' },
      'notes: a fail verdict needs specific notes (at least 20 characters)',
    ],
    [
      'a fail without fail_kind',
      { result: 'fail', notes: NOTES },
      'fail_kind: a fail verdict needs fail_kind',
    ],
    ['a partial without progress', { result: 'partial' }, 'progress: a partial verdict needs progress'],
    [
      'a human verdict under a character name',
      { by_human: true },
      'verifier_id: a human verdict has verifier_id user',
    ],
    [
      'an owner verdict not marked human',
      { verifier_id: 'user' },
      'by_human: verifier_id user is a human verdict',
    ],
    ['an id of another attempt', { id: `${QUEST}-1` }, ID_ISSUE],
    ['an id of another attempt with a suffix', { id: `${QUEST}-1-user`, ...OWNER }, ID_ISSUE],
    ['a partial id on a pass', { id: `${QUEST}-2-p1` }, ID_ISSUE],
    ['an owner id on a judge verdict', { id: `${QUEST}-2-user` }, ID_ISSUE],
    ['a run number glued to the attempt', { id: `${QUEST}-21` }, ID_ISSUE],
    [
      'a character verdict without session',
      { session_id: undefined },
      "session_id: a character's verdict names its session",
    ],
    [
      'a rejudge by a judge',
      { rejudge: true },
      "rejudge: rejudge marks only the owner's return, a human fail verdict",
    ],
    [
      'a rejudge on a seal',
      { id: `${QUEST}-2-user`, ...OWNER, rejudge: true },
      "rejudge: rejudge marks only the owner's return, a human fail verdict",
    ],
    [
      'a break without its red run',
      { breaks: [{ change: 'src/a.ts:3 returns 0', red: '' }] },
      'breaks.0.red: Too small: expected string to have >=1 characters',
    ],
    [
      'one check reported twice',
      { checks: [pass.checks[0], pass.checks[0]] },
      'checks.1.id: duplicate id "lint"',
    ],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf(change)).toEqual([expected]);
  });
});
