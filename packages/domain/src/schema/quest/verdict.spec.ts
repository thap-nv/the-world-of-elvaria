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
    ['a royal seal without session', { verifier_id: 'user', by_human: true, session_id: undefined }],
    ['a machine verdict without session', { verifier_id: 'machine', session_id: undefined }],
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
    ['an id of another attempt', { id: `${QUEST}-1` }, 'id: the verdict id is <quest_id>-<attempt>'],
    [
      'a character verdict without session',
      { session_id: undefined },
      "session_id: a character's verdict names its session",
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
