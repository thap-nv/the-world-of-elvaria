// The fix quest of a late fail found after the merge (CM-06, ADR 0033, C2, C7): which attributions open one, its
// payload as questFromCommand takes it, open within kingdom.delegation.max_rank and a draft above it, and who the
// Steward claims it for.
import { describe, expect, it } from 'vitest';

import { KINGDOM, Q1, Q2, at, character, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { questFromCommand } from '../dispatch/new-quest.ts';
import { lateFixDraft, lateFixDueOf, lateFixHolderOf, lateFixOf } from './late-fix.ts';
import type { CampaignId, ClassId, QuestId, TerritoryId } from '../core/ids.ts';
import type { NewQuestContext } from '../dispatch/new-quest.ts';
import type { CheckAttributedData } from '../schema/event/check-data.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { LateFixHolder, LateFixInput } from './late-fix.ts';

const FIX = 'q_20261124_f1x2a3' as QuestId;
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

const KINDS = [
  {
    id: 'fix',
    name_vi: 'Trừ tà',
    name_en: 'Fix',
    classes_allowed: ['knight', 'dwarf'],
    seal_default: true,
    deliverable_type: 'branch',
  },
  {
    id: 'build',
    name_vi: 'Xây dựng',
    name_en: 'Build',
    classes_allowed: ['knight'],
    seal_default: false,
    deliverable_type: 'branch',
  },
] as unknown as LateFixInput['kinds'];

/** An archived quest whose merge turned its base branch red. */
const rooms: Quest = {
  ...quest(Q2, { scope: ['src/rooms/**'], tags: ['backend'], rank: 'C' }),
  title: 'Rooms API',
  status: 'archived',
  secrets_required: ['npm_token'],
};

const input = (over: Partial<LateFixInput> = {}): LateFixInput => ({
  origin: rooms,
  cause: 'own_change',
  checks: [{ name: 'test', tail: 'FAIL rooms.spec.ts' }, { name: 'lint' }],
  base: { branch: 'main', commit: SHA },
  max_rank: 'C',
  kinds: KINDS,
  locale: 'en',
  ...over,
});

const REGISTRY = {
  kinds: KINDS,
  tags: [{ id: 'backend' }],
  scripts: [],
} as unknown as NewQuestContext['registry'];

const made = (payload: ReturnType<typeof lateFixOf>): Quest => {
  const quest = questFromCommand(payload, {
    id: FIX,
    at: at(30),
    breakers: KINGDOM.breakers,
    registry: REGISTRY,
    territories: [{ id: rooms.territory, secrets_allowed: ['npm_token'] }],
    quests: [Q1, Q2],
  });
  if (!quest.ok) throw new Error(JSON.stringify(quest.error));
  return quest.value;
};

const attributed = (over: Partial<CheckAttributedData> = {}): CheckAttributedData => ({
  territory: 'dc1-se-team' as TerritoryId,
  source: 'patrol',
  checks: ['test'],
  runs: [],
  commit: SHA,
  culprit: Q2,
  cause: 'own_change',
  ...over,
});

describe('lateFixDueOf', () => {
  it("opens a fix for a patrol's own_change and combination, under the quest and the first red commit", () => {
    expect(lateFixDueOf(attributed())).toEqual({ origin: Q2, commit: SHA, cause: 'own_change' });
    expect(lateFixDueOf(attributed({ cause: 'combination' }))?.cause).toBe('combination');
  });

  it('opens none for the other causes, for the queue, or without a quest or a commit', () => {
    for (const cause of ['flaky', 'outside', 'unknown'] as const)
      expect(lateFixDueOf(attributed({ cause }))).toBeUndefined();
    expect(lateFixDueOf(attributed({ source: 'queue' }))).toBeUndefined();
    const { culprit: _culprit, ...unnamed } = attributed();
    const { commit: _commit, ...uncommitted } = attributed();
    expect(lateFixDueOf(unnamed)).toBeUndefined();
    expect(lateFixDueOf(uncommitted)).toBeUndefined();
  });
});

describe('lateFixOf', () => {
  it("opens a patrol's fix under the quest, on its territory, rank, tags, scope and secrets", () => {
    const fix = made(lateFixOf(input()));
    expect(fix).toMatchObject({
      status: 'open',
      kind: 'fix',
      rank: 'C',
      territory: rooms.territory,
      class_required: rooms.class_required,
      tags: ['backend'],
      scope_paths: ['src/rooms/**'],
      secrets_required: ['npm_token'],
      parent_id: Q2,
      created_by: 'patrol',
      seal_required: true,
      title: 'Fix: Rooms API',
    });
    expect(fix.depends_on).toEqual([]);
  });

  it('tells its own change from a merge of both sides, and names the checks, their logs and the commit', () => {
    const own = lateFixOf(input()).description;
    expect(own).toContain('late machine verdict');
    expect(own).toContain('main (abcdef1)');
    expect(own).toContain('- test, the end of its log:\n```\nFAIL rooms.spec.ts\n```');
    expect(own).toContain('- lint\n');
    const both = lateFixOf(input({ cause: 'combination', checks: [{ name: 'test', tail: '' }] })).description;
    expect(both).toContain('their merge does');
    expect(both).not.toContain('late machine verdict');
    expect(both).toContain('- test\n');
  });

  it('is a draft above kingdom.delegation.max_rank (C7)', () => {
    expect(lateFixOf(input({ max_rank: 'D' })).draft).toBe(true);
    expect(made(lateFixOf(input({ max_rank: 'D' }))).status).toBe('draft');
    expect(lateFixDraft('C', 'C')).toBe(false);
    expect(lateFixDraft('B', 'C')).toBe(true);
  });

  it("names the kind in the owner's language, and the kind's id when the registry lacks it", () => {
    expect(lateFixOf(input({ locale: 'vi' })).title).toBe('Trừ tà: Rooms API');
    const bare = lateFixOf(input({ kinds: [] }));
    expect(bare.title).toBe('fix: Rooms API');
    expect(bare.class_required).toBe(rooms.class_required);
  });

  it("takes the kind's first class when the quest's is not allowed, and leaves out what the quest has not", () => {
    const scribe = {
      ...rooms,
      class_required: 'scribe',
      scope_paths: [],
      secrets_required: [],
    } as unknown as Quest;
    const payload = lateFixOf(input({ origin: scribe }));
    expect(payload.class_required).toBe('knight');
    expect(payload).not.toHaveProperty('scope_paths');
    expect(payload).not.toHaveProperty('secrets_required');
    const { class_required: _class, scope_paths: _scope, ...bare } = rooms;
    const noKinds = [{ ...KINDS[0], classes_allowed: [] }] as unknown as LateFixInput['kinds'];
    expect(lateFixOf(input({ origin: bare, kinds: noKinds }))).not.toHaveProperty('class_required');
  });

  it("keeps the quest's campaign", () => {
    const campaign = 'c_20261124_abcdef' as CampaignId;
    expect(lateFixOf(input({ origin: { ...rooms, campaign_id: campaign } })).campaign_id).toBe(campaign);
  });
});

describe('lateFixHolderOf', () => {
  const THORN = character('thorn');
  const holder = (over: Partial<LateFixHolder> = {}): LateFixHolder => ({
    cause: 'own_change',
    fix: { status: 'open', class_required: THORN.class },
    doer: THORN,
    tribes: KINGDOM.tribes,
    asleep: false,
    ...over,
  });

  it('gives an open fix of its own change to the doer who may take it now', () => {
    expect(lateFixHolderOf(holder())).toBe(THORN.id);
    expect(lateFixHolderOf(holder({ doer: character('thorn', { status: 'working' }) }))).toBe(THORN.id);
  });

  it('gives it to nobody for a combination, a draft, or a doer asleep, suspended, gone or of another class', () => {
    expect(lateFixHolderOf(holder({ cause: 'combination' }))).toBeUndefined();
    expect(
      lateFixHolderOf(holder({ fix: { status: 'draft', class_required: THORN.class } })),
    ).toBeUndefined();
    expect(lateFixHolderOf(holder({ asleep: true }))).toBeUndefined();
    expect(
      lateFixHolderOf(holder({ doer: character('thorn', { status: 'sleeping_mana' }) })),
    ).toBeUndefined();
    expect(lateFixHolderOf(holder({ doer: character('thorn', { status: 'suspended' }) }))).toBeUndefined();
    expect(lateFixHolderOf(holder({ doer: undefined }))).toBeUndefined();
    const scribe: LateFixHolder['fix'] = { status: 'open', class_required: 'scribe' as ClassId };
    expect(lateFixHolderOf(holder({ fix: scribe }))).toBeUndefined();
  });
});
