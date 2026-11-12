import { describe, expect, it } from 'vitest';

import examples from '../../../examples/quest.json' with { type: 'json' };
import { QuestSchema } from './quest.ts';

// examples/ is the one source of the contract's `examples` (ADR 0003): the zod source must accept them.
const ID = 'q_20261106_7k3m2a';
const OTHER_ID = 'q_20261106_9p4r8d';

const minimal = {
  version: 1,
  id: ID,
  title: 'Thêm script pnpm check',
  description: 'Thêm script `pnpm check` và cập nhật README.',
  kind: 'build',
  rank: 'D',
  territory: 'dc1-se-team',
  class_required: 'knight',
  tags: ['infra'],
  status: 'open',
  tier: 'session',
  budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
  estimate: { tokens: 200000, minutes: 30 },
  attempts: 0,
  attempt_log: [],
  plot: { type: 'none' },
  deliverable: { type: 'branch' },
  seal_required: false,
  created_by: 'user',
  created_at: '2026-11-06T09:05:00+07:00',
  updated_at: '2026-11-06T09:05:00+07:00',
};

const attempt = (character: string | null, role: 'assignee' | 'verifier', n = 1) => ({
  n,
  character,
  role,
  started_at: '2026-11-06T09:12:03+07:00',
  run_dir: `.runs/${ID}-${n}${role === 'verifier' ? '/verify' : ''}`,
});
const script = { id: 'link-check', params: { globs: ['README.md'] } };
const worktree = { type: 'worktree', path: 'D:/repo/.elvaria/worktrees/x', branch: `quest/${ID}` };

const issuesOf = (value: unknown) => {
  const result = QuestSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('QuestSchema', () => {
  it.each(examples.map((example) => [example.id, example]))(
    'accepts the v1 example %s unchanged',
    (_, example) => {
      expect(QuestSchema.parse(example)).toEqual(example);
    },
  );

  it('fills the contract defaults from a minimal file', () => {
    expect(QuestSchema.parse(minimal)).toEqual({
      ...minimal,
      depends_on: [],
      secrets_required: [],
      checks_run: [],
    });
    const scripted = QuestSchema.parse({ ...minimal, tier: 'script', script: { id: 'link-check' } });
    expect(scripted.script).toEqual({ id: 'link-check', params: {} });
  });

  it.each([
    ['a quest held by its assignee', { status: 'working', assignee: 'thorn' }],
    [
      'a blocked quest with its question',
      { status: 'blocked', blocked: { question: 'Which locale?', asked_at: minimal.created_at } },
    ],
    ['a sealed quest that is done', { status: 'done', seal: { at: minimal.updated_at } }],
    ['the contract quest of a party', { party_id: ID, party_role: 'contract' }],
    [
      'a part that knows the contract',
      { party_id: OTHER_ID, party_role: 'part', contract: 'apps/api/openapi.json' },
    ],
    ['a folder plot', { plot: { type: 'folder', path: `quests/${ID}/work` } }],
    ['a worktree plot on its own branch', { plot: worktree }],
    [
      'a verifier who only verified',
      {
        status: 'review',
        attempts: 1,
        assignee: 'thorn',
        verifier: 'brann',
        attempt_log: [attempt('thorn', 'assignee'), attempt('brann', 'verifier')],
      },
    ],
    [
      'a script run without a character',
      { tier: 'script', script, assignee: null, attempt_log: [attempt(null, 'assignee')] },
    ],
    [
      "a quest in review after the Steward's own run, which is no attempt (P1-55)",
      {
        status: 'review',
        attempts: 0,
        assignee: null,
        party_id: OTHER_ID,
        party_role: 'merge',
        contract: 'apps/api/openapi.json',
        attempt_log: [attempt(null, 'assignee')],
      },
    ],
  ])('accepts %s', (_, change) => {
    expect(issuesOf({ ...minimal, ...change })).toEqual([]);
  });

  it.each([
    ['an unknown field', { journal: 'quests/x/journal.jsonl' }, 'Unrecognized key'],
    ['a malformed id', { id: 'q_2026_7k3m2a' }, 'id: '],
    ['a title too long for the board', { title: 'x'.repeat(121) }, 'title: '],
    ['seven tags', { tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 'tags: '],
    ['a tag twice', { tags: ['docs', 'docs'] }, 'tags: items must be unique'],
    ['a dependency twice', { depends_on: [OTHER_ID, OTHER_ID] }, 'depends_on: items must be unique'],
    ['a status outside the state machine', { status: 'approved' }, 'status: '],
    ['a campaign id of a quest', { campaign_id: OTHER_ID }, 'campaign_id: '],
    [
      'a budget of zero minutes',
      { budget: { max_minutes: 0, max_tokens: 0, max_attempts: 1 } },
      'budget.max_minutes',
    ],
    ['an unknown creator', { created_by: 'steward' }, 'created_by: '],
    ['a plot branch that is not a quest branch', { plot: { ...worktree, branch: 'main' } }, 'plot.branch: '],
    ['attempt number zero', { attempt_log: [{ ...attempt('thorn', 'assignee'), n: 0 }] }, 'attempt_log.0.n'],
    [
      'a run_dir outside .runs',
      { attempt_log: [{ ...attempt('thorn', 'assignee'), run_dir: 'runs/x' }] },
      'attempt_log.0.run_dir',
    ],
    [
      'a run_dir with backslashes',
      { attempt_log: [{ ...attempt('thorn', 'assignee'), run_dir: '.runs\\x' }] },
      'attempt_log.0.run_dir',
    ],
    ['a unit id with capitals', { units: [{ id: 'U1', label: 'a', outcome: 'done' }] }, 'units.0.id'],
    ['a secret name in kebab-case', { secrets_required: ['npm-token'] }, 'secrets_required.0'],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf({ ...minimal, ...change }).join('\n')).toContain(expected);
  });

  it.each([
    ['a script-tier quest without script', { tier: 'script' }, 'script: a script-tier quest needs script'],
    [
      'a script-tier quest with an assignee',
      { tier: 'script', script, assignee: 'thorn' },
      'assignee: a script-tier quest has no assignee: the Steward runs it',
    ],
    [
      'a working session-tier quest without assignee',
      { status: 'working', assignee: null },
      'assignee: a session-tier quest in working needs an assignee',
    ],
    [
      'a quest in review before any attempt',
      { status: 'review', assignee: 'thorn' },
      'attempts: a quest in review has had a run',
    ],
    [
      'a sealed quest still open',
      { seal: { at: minimal.updated_at } },
      'status: a sealed quest is done or archived',
    ],
    ['a blocked quest without question', { status: 'blocked' }, 'blocked: a blocked quest needs blocked'],
    [
      'a session-tier quest without class',
      { class_required: undefined },
      'class_required: a session-tier quest needs class_required',
    ],
    ['a party member without role', { party_id: ID }, 'party_role: a party member needs party_role'],
    ['a party role without party', { party_role: 'contract' }, 'party_id: a party role needs party_id'],
    [
      'a part without contract',
      { party_id: OTHER_ID, party_role: 'part' },
      'contract: a party part needs the contract path',
    ],
    [
      'a merge quest without contract',
      { party_id: OTHER_ID, party_role: 'merge' },
      'contract: a party merge needs the contract path',
    ],
    [
      'a contract quest of another party',
      { party_id: OTHER_ID, party_role: 'contract' },
      'party_id: party_id is the quest id exactly for the contract quest',
    ],
    [
      'a part that claims to be the contract',
      { party_id: ID, party_role: 'part', contract: 'apps/api/openapi.json' },
      'party_id: party_id is the quest id exactly for the contract quest',
    ],
    [
      'a verifier who is the assignee',
      { assignee: 'thorn', verifier: 'thorn' },
      'verifier: the verifier is not the assignee (ADR 0008)',
    ],
    [
      'a verifier who worked the quest',
      { assignee: 'brann', verifier: 'thorn', attempt_log: [attempt('thorn', 'assignee')] },
      'verifier: the verifier never worked this quest (ADR 0008)',
    ],
    [
      "another quest's plot branch",
      { plot: { ...worktree, branch: `quest/${OTHER_ID}` } },
      'plot.branch: the plot branch is quest/<id>',
    ],
    [
      'a worktree plot without path',
      { plot: { type: 'worktree', branch: `quest/${ID}` } },
      'plot.path: a worktree plot needs path',
    ],
    [
      'a worktree plot without branch',
      { plot: { type: 'worktree', path: 'D:/x' } },
      'plot.branch: a worktree plot needs branch',
    ],
    ['a folder plot without path', { plot: { type: 'folder' } }, 'plot.path: a folder plot needs path'],
    [
      'two units with one id',
      {
        units: [
          { id: 'u1', label: 'a', outcome: 'done' },
          { id: 'u1', label: 'b', outcome: 'debt' },
        ],
      },
      'units.1.id: duplicate id "u1"',
    ],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf({ ...minimal, ...change })).toEqual([expected]);
  });
});
