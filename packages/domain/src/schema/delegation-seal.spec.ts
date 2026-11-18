// The contract of the delegation of the seal (PS-08b): kingdom.delegation.seal, and the two quest fields it writes.
import { describe, expect, it } from 'vitest';

import questExamples from '../../examples/quest.json' with { type: 'json' };
import { DelegationSchema } from './delegation.ts';
import { QuestSchema } from './quest/quest.ts';

const issuesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.success ? [] : (result.error?.issues ?? []).map(({ path }) => path.join('.'));

describe('kingdom.delegation.seal', () => {
  it('is absent unless the owner writes it: no quest goes without the seal by delegation', () => {
    expect(DelegationSchema.parse({}).seal).toBeUndefined();
  });

  it('bounds the diff at 400 lines unless the owner says otherwise', () => {
    expect(DelegationSchema.parse({ seal: { max_rank: 'D', kinds: ['fix'] } }).seal).toEqual({
      max_rank: 'D',
      kinds: ['fix'],
      max_diff_lines: 400,
    });
  });

  it('needs a rank and at least one kind, each once, and a ceiling of one line or more', () => {
    expect(issuesOf(DelegationSchema.safeParse({ seal: { kinds: ['fix'] } }))).toEqual(['seal.max_rank']);
    expect(issuesOf(DelegationSchema.safeParse({ seal: { max_rank: 'D', kinds: [] } }))).toEqual([
      'seal.kinds',
    ]);
    const twice = { seal: { max_rank: 'D', kinds: ['fix', 'fix'] } };
    expect(issuesOf(DelegationSchema.safeParse(twice))).toEqual(['seal.kinds']);
    const none = { seal: { max_rank: 'D', kinds: ['fix'], max_diff_lines: 0 } };
    expect(issuesOf(DelegationSchema.safeParse(none))).toEqual(['seal.max_diff_lines']);
  });
});

describe('quest.seal_delegated and quest.seal_raised', () => {
  const [example] = questExamples;

  it('takes a quest the delegation spared, with the reasons the machine raised its seal', () => {
    const quest = { ...example, seal_required: true, seal_delegated: true, seal_raised: ['diff_size'] };
    expect(QuestSchema.parse(quest)).toMatchObject({ seal_delegated: true, seal_raised: ['diff_size'] });
  });

  it('refuses a mark that is not true, an empty or repeated list, and a reason it does not know', () => {
    expect(issuesOf(QuestSchema.safeParse({ ...example, seal_delegated: false }))).toEqual([
      'seal_delegated',
    ]);
    expect(issuesOf(QuestSchema.safeParse({ ...example, seal_raised: [] }))).toEqual(['seal_raised']);
    const twice = { ...example, seal_raised: ['objection', 'objection'] };
    expect(issuesOf(QuestSchema.safeParse(twice))).toEqual(['seal_raised']);
    expect(issuesOf(QuestSchema.safeParse({ ...example, seal_raised: ['taste'] }))).toEqual([
      'seal_raised.0',
    ]);
  });
});
