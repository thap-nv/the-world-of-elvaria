import { describe, expect, it } from 'vitest';

import examples from '../../../examples/quest-draft.json' with { type: 'json' };
import { QuestDraftFileSchema } from './quest-draft.ts';

const draft = (ref: string, change: object = {}) => ({
  ref,
  title: 'Cập nhật docs/architecture.md',
  description: 'Viết lại các mục chịu ảnh hưởng của ADR 0014-0018.',
  kind: 'document',
  rank: 'D',
  territory: 'dc1-se-team',
  tier: 'session',
  class_required: 'scribe',
  tags: ['docs'],
  depends_on_refs: [],
  estimate: { tokens: 110000, minutes: 40 },
  seal_required: true,
  secrets_required: [],
  ...change,
});

const issuesOf = (...drafts: object[]) => {
  const result = QuestDraftFileSchema.safeParse({ version: 1, drafts });
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('QuestDraftFileSchema', () => {
  it.each(examples.map((example, index) => [index, example]))(
    'accepts v1 example %i unchanged',
    (_, example) => {
      expect(QuestDraftFileSchema.parse(example)).toEqual(example);
    },
  );

  it('accepts a plan with a child that depends on it and one question', () => {
    const plan = draft('d1', { kind: 'plan', class_required: 'mage', question: 'Giữ thứ tự mục?' });
    expect(issuesOf(plan, draft('d2', { depends_on_refs: ['d1'], parent_ref: 'd1' }))).toEqual([]);
  });

  it.each([
    ['no draft at all', [], 'drafts: '],
    ['thirteen drafts', Array.from({ length: 13 }, (_, index) => draft(`d${index + 1}`)), 'drafts: '],
    ['a ref that is not d<n>', [draft('q1')], 'drafts.0.ref'],
    ['an unknown field', [draft('d1', { assignee: 'thorn' })], 'Unrecognized key'],
    ['a title too long', [draft('d1', { title: 'x'.repeat(121) })], 'drafts.0.title'],
    ['seven tags', [draft('d1', { tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })], 'drafts.0.tags'],
    ['a secret twice', [draft('d1', { secrets_required: ['npm', 'npm'] })], 'items must be unique'],
    ['a question too long', [draft('d1', { question: 'x'.repeat(301) })], 'drafts.0.question'],
    [
      'a merge quest, which only the Steward creates',
      [draft('d1', { party_role: 'merge' })],
      'drafts.0.party_role',
    ],
    [
      'a script without params',
      [draft('d1', { tier: 'script', script: { id: 'link-check' } })],
      'drafts.0.script.params',
    ],
  ])('rejects %s', (_, drafts, expected) => {
    expect(issuesOf(...drafts).join('\n')).toContain(expected);
  });

  it.each([
    [
      'a script-tier draft without script',
      [draft('d1', { tier: 'script' })],
      'drafts.0.script: a script-tier quest needs script',
    ],
    [
      'a session-tier draft without class',
      [draft('d1', { class_required: undefined })],
      'drafts.0.class_required: a session-tier quest needs class_required',
    ],
    [
      'a part without contract',
      [draft('d1', { party_role: 'part' })],
      'drafts.0.contract: a party part needs the contract path',
    ],
    [
      'a second question',
      [draft('d1', { question: 'Một?' }), draft('d2', { question: 'Hai?' })],
      'drafts.1.question: the Chancellor asks at most one question',
    ],
    ['the same ref twice', [draft('d1'), draft('d1')], 'drafts.1.ref: duplicate ref "d1"'],
    [
      'a dependency on a ref not in the reply',
      [draft('d1', { depends_on_refs: ['d9'] })],
      'drafts.0.depends_on_refs.0: no other draft "d9"',
    ],
    [
      'a draft that depends on itself',
      [draft('d1', { depends_on_refs: ['d1'] })],
      'drafts.0.depends_on_refs.0: no other draft "d1"',
    ],
    [
      'a parent not in the reply',
      [draft('d1', { parent_ref: 'd2' })],
      'drafts.0.parent_ref: no other draft "d2"',
    ],
    [
      'a draft that is its own parent',
      [draft('d1', { parent_ref: 'd1' })],
      'drafts.0.parent_ref: no other draft "d1"',
    ],
  ])('rejects %s', (_, drafts, expected) => {
    expect(issuesOf(...drafts)).toEqual([expected]);
  });
});
