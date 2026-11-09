import { describe, expect, it } from 'vitest';

import { QUEST_TITLE_MAX_LENGTH } from '../constants.ts';
import { questIn } from '../quest/__fixtures__/quests.ts';
import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { verdictOf } from './__fixtures__/verdicts.ts';
import { flakyFollowUpOf, isFlaky } from './flaky-follow-up.ts';
import { FLAKE_CHECK_ID } from './pass-rule.ts';
import type { Kind, Ritual } from '../schema/registry-entries.ts';
import type { VerdictCheck } from '../schema/quest/verdict.ts';

const FIX = { id: 'fix', name_vi: 'Trừ tà', name_en: 'Fix' } as unknown as Kind;
const MUTATION = {
  id: 'mutation_check',
  flaky_follow_up: { kind: 'fix', class: 'knight' },
} as unknown as Ritual;
const flake = (pass: boolean): VerdictCheck => ({
  id: FLAKE_CHECK_ID,
  pass,
  duration_ms: 9,
  log_path: '.runs/q-1/checks/flake_check.log',
});
const NOTES = '✗ flake_check: .runs/q-1/checks/flake_check.log';
const flaky = verdictOf({ result: 'fail', fail_kind: 'flaky', checks: [flake(false)], notes: NOTES });
const parent = questIn('review');

describe('isFlaky', () => {
  it('sees a flake in a failing flake check or in a judge who says flaky', () => {
    expect(isFlaky(flaky)).toBe(true);
    expect(isFlaky({ ...flaky, fail_kind: 'incomplete' })).toBe(true);
    expect(isFlaky({ ...flaky, checks: [] })).toBe(true);
  });

  it('sees none in a pass, or in another failure', () => {
    expect(isFlaky({ ...flaky, result: 'pass' })).toBe(false);
    expect(isFlaky({ ...flaky, fail_kind: 'tests_fail', checks: [flake(true)] })).toBe(false);
  });
});

describe('flakyFollowUpOf', () => {
  it("opens one session quest of the ritual's kind and class to exorcise the flake", () => {
    const payload = flakyFollowUpOf({ parent, ritual: MUTATION, kinds: [FIX], verdict: flaky, locale: 'vi' });
    expect(payload).toEqual({
      draft: false,
      title: `Trừ tà: ${parent.title}`,
      description: expect.stringContaining(NOTES) as string,
      kind: 'fix',
      rank: parent.rank,
      territory: parent.territory,
      tier: 'session',
      class_required: 'knight',
      tags: parent.tags,
      parent_id: parent.id,
      created_by: 'patrol',
    });
    expect(payload?.description).toContain(`branch quest/${parent.id}`);
    const command = { version: 1, id: '01JC0000000000000000000000', ts: parent.created_at };
    const parsed = InboxCommandSchema.safeParse({ ...command, kind: 'create_quest', source: 'cli', payload });
    expect(parsed.success).toBe(true);
  });

  it("names the kind in the owner's language, keeps the title short, and works without notes", () => {
    const long = { ...parent, title: 't'.repeat(QUEST_TITLE_MAX_LENGTH) };
    const { notes: _gone, ...bare } = flaky;
    const payload = flakyFollowUpOf({
      parent: long,
      ritual: MUTATION,
      kinds: [FIX],
      verdict: bare,
      locale: 'en',
    });
    expect(payload?.title.startsWith('Fix: ttt')).toBe(true);
    expect(payload?.title).toHaveLength(QUEST_TITLE_MAX_LENGTH);
    expect(payload?.description).not.toContain('\n\n');
  });

  it('opens none without a flake, without a follow-up, or for a kind the registry lacks', () => {
    const run = { parent, ritual: MUTATION, kinds: [FIX], verdict: flaky, locale: 'en' } as const;
    expect(flakyFollowUpOf({ ...run, verdict: { ...flaky, result: 'pass' } })).toBeUndefined();
    expect(flakyFollowUpOf({ ...run, ritual: { ...MUTATION, flaky_follow_up: undefined } })).toBeUndefined();
    expect(flakyFollowUpOf({ ...run, kinds: [] })).toBeUndefined();
  });
});
