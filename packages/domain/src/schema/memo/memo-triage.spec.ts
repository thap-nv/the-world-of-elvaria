import { describe, expect, it } from 'vitest';

import examples from '../../../examples/memo-triage.json' with { type: 'json' };
import { MemoTriageFileSchema } from './memo-triage.ts';

const [example] = examples;
if (example === undefined) throw new Error('examples/memo-triage.json holds a reply');
const [draft] = example.drafts;

const issuesOf = (value: unknown) => {
  const result = MemoTriageFileSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

const decision = (over: Record<string, unknown>) => ({
  memo: 'm_20261112_4k2pqz',
  action: 'shelve',
  ask: [],
  note: 'A duplicate.',
  ...over,
});
const reply = (decisions: readonly unknown[], drafts: readonly unknown[] = []) => ({
  version: 1,
  decisions,
  drafts,
});

describe('MemoTriageFileSchema', () => {
  it.each(examples)('accepts the example of the v1 contract unchanged', (value) => {
    expect(MemoTriageFileSchema.parse(value)).toEqual(value);
  });

  it('takes a reply without drafts as one with none', () => {
    const { drafts: _, ...shelved } = reply([decision({})]);
    expect(MemoTriageFileSchema.parse(shelved).drafts).toEqual([]);
  });

  it.each([
    ['a merge without its quest', reply([decision({ action: 'merge' })]), 'decisions.0.quest: a merge names'],
    [
      'a new quest without its draft',
      reply([decision({ action: 'new_quest' })]),
      'decisions.0.draft_ref: a new quest names',
    ],
    [
      'a new quest naming no draft of the reply',
      reply([decision({ action: 'new_quest', draft_ref: 'd2' })], [draft]),
      'decisions.0.draft_ref: no draft "d2"',
    ],
    [
      'a memo decided twice',
      reply([decision({}), decision({ action: 'owner' })]),
      'decisions.1.memo: memo m_20261112_4k2pqz decided twice',
    ],
    ['two drafts with one ref', reply([decision({})], [draft, draft]), 'drafts.1.ref: duplicate ref "d1"'],
    [
      'a draft with a parent',
      reply([decision({})], [{ ...draft, parent_ref: 'd2' }]),
      'drafts.0: a triage draft is one quest',
    ],
    [
      'a draft waiting on another',
      reply([decision({})], [{ ...draft, depends_on_refs: ['d2'] }]),
      'drafts.0: a triage draft is one quest',
    ],
    [
      'a draft of a party',
      reply([decision({})], [{ ...draft, party_role: 'contract' }]),
      'drafts.0: a triage draft is one quest',
    ],
    ['an unknown matter', reply([decision({ ask: ['taste'] })]), 'decisions.0.ask.0: Invalid option'],
    ['no decision', reply([]), 'decisions: Too small'],
    ['an empty note', reply([decision({ note: '' })]), 'decisions.0.note: Too small'],
  ])('rejects %s', (_, value, expected) => {
    expect(issuesOf(value).join('\n')).toContain(expected);
  });
});
