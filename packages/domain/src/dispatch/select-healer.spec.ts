import { describe, expect, it } from 'vitest';

import { Q1, Q2, character, inReview, moved, quest, workingBy } from './__fixtures__/snapshot.ts';
import { selectHealer } from './select-healer.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TribeModels } from '../tribe/models.ts';
import type { HealerClass, HealerPolicy } from './select-healer.ts';

const CLASSES = [
  { id: 'knight', is_healer: false },
  { id: 'judge' },
  { id: 'healer', is_healer: true },
] as unknown as readonly HealerClass[];

const healer = (id: string, tribe: string, model: string, spec: Parameters<typeof character>[1] = {}) =>
  character(id, { cls: 'healer', tribe, model, ...spec });

// One healer per tribe, each on a model of its tribe's family (K7 of plans/healer.md).
const SALVE = healer('salve', 'claude', 'claude-sonnet-5-5');
const TINCT = healer('tinct', 'codex', 'gpt-6.1-sol-low');
const BALM = healer('balm', 'gemini', 'gemini-3.8-flash-high');
const HEALERS = [SALVE, TINCT, BALM];

const THORN = character('thorn');
const DORIAN = character('dorian', { tribe: 'codex', model: 'gpt-6.1-sol' });
const GALE = character('gale', { tribe: 'gemini', model: 'gemini-4-argon-medium' });
const GEMINI = 'gemini' as TribeId;
const CODEX = 'codex' as TribeId;

const policyOf = (more: Partial<HealerPolicy> = {}): HealerPolicy => ({
  classes: CLASSES,
  stands: (candidate) => candidate.status !== 'suspended' && candidate.status !== 'sleeping_mana',
  free: (candidate) => candidate.status === 'idle',
  ...more,
});

/** Who heals: a healer's id, `wait` or `doer`. */
const healerOf = (q: Quest, roster: readonly Character[], more: Partial<HealerPolicy> = {}): string => {
  const choice = selectHealer(q, roster, policyOf(more));
  return choice.by === 'healer' ? choice.character.id : choice.by;
};

describe('selectHealer', () => {
  it("takes the healer of the doer's family among three healers of three families (K7)", () => {
    const roster = [THORN, DORIAN, GALE, ...HEALERS];
    expect(healerOf(workingBy(quest(Q1), 'thorn'), roster)).toBe('salve');
    expect(healerOf(workingBy(quest(Q1), 'dorian'), roster)).toBe('tinct');
    expect(healerOf(workingBy(quest(Q1), 'gale'), roster)).toBe('balm');
  });

  it('counts every doer of the quest, the runs before included', () => {
    // gale worked the first run; thorn has the quest now: a healer of either family adds no family.
    const reassigned = { ...workingBy(quest(Q1), 'gale'), assignee: 'thorn' as CharacterId };
    expect(healerOf(reassigned, [THORN, GALE, TINCT, BALM])).toBe('balm');
    expect(healerOf(reassigned, [THORN, GALE, TINCT])).toBe('doer');
  });

  it("reads the family from the model, not the tribe's name (plans/healer.md 4.3)", () => {
    const onClaude = healer('poultice', 'gemini', 'claude-opus-5-5');
    expect(healerOf(workingBy(quest(Q1), 'thorn'), [THORN, BALM, onClaude])).toBe('poultice');
    // The adapter's families win over the slug (PS-23); a model it names without one is of no known family.
    const models: TribeModels = {
      [GEMINI]: [{ id: 'claude-opus', family: 'claude' }, { id: 'gemini-3.8-flash' }],
    };
    expect(healerOf(workingBy(quest(Q1), 'thorn'), [THORN, BALM, onClaude], { models })).toBe('poultice');
    expect(healerOf(workingBy(quest(Q1), 'gale'), [GALE, BALM], { models })).toBe('doer');
  });

  it("leaves the heal to the doer without a healer of the doer's family", () => {
    const work = workingBy(quest(Q1), 'dorian');
    // A kingdom that summoned no healer: the roster is the switch of (515).
    expect(healerOf(work, [THORN, DORIAN])).toBe('doer');
    expect(healerOf(work, [DORIAN, SALVE, BALM])).toBe('doer');
    // A doer whose file is gone, or of no known family, has no family to share.
    expect(healerOf(work, HEALERS)).toBe('doer');
    // The adapter names the healer's model with its family and the doer's without one.
    const unknown: TribeModels = {
      [CODEX]: [{ id: 'gpt-6.1-sol-low', family: 'gpt' }, { id: 'gpt-6.1-sol' }],
    };
    expect(healerOf(work, [DORIAN, ...HEALERS], { models: unknown })).toBe('doer');
  });

  it('waits for a busy healer of the family, and never takes one of another family meanwhile', () => {
    const work = workingBy(quest(Q1), 'dorian');
    const busy = healer('tinct', 'codex', 'gpt-6.1-sol-low', { status: 'working' });
    expect(selectHealer(work, [DORIAN, busy, SALVE, BALM], policyOf())).toEqual({ by: 'wait' });
  });

  it('leaves the heal to the doer while the healer of the family is suspended or asleep (ADR 0034)', () => {
    const work = workingBy(quest(Q1), 'dorian');
    for (const status of ['suspended', 'sleeping_mana'] as const) {
      const out = character('tinct', { cls: 'healer', tribe: 'codex', model: 'gpt-6.1-sol-low', status });
      expect(healerOf(work, [DORIAN, out])).toBe('doer');
    }
    // A pool that cannot open a session: the Steward's stands, not the status, says it.
    expect(healerOf(work, [DORIAN, TINCT], { stands: () => false })).toBe('doer');
  });

  it('takes the free healer of the higher level first, then the one idle the longest, then by id', () => {
    const work = workingBy(quest(Q1), 'thorn');
    const senior = healer('senior', 'claude', 'claude-opus-5-5', { level: 6, since: 50 });
    const early = healer('early', 'claude', 'claude-sonnet-5-5', { since: 5 });
    const late = healer('late', 'claude', 'claude-sonnet-5-5', { since: 40 });
    const twin = healer('twin', 'claude', 'claude-sonnet-5-5', { since: 5 });
    expect(healerOf(work, [THORN, late, early, senior])).toBe('senior');
    expect(healerOf(work, [THORN, late, early])).toBe('early');
    expect(healerOf(work, [THORN, twin, early])).toBe('early');
  });

  it('never takes the assignee itself, nor a character of a class that does not heal', () => {
    const mender = healer('mender', 'claude', 'claude-sonnet-5-5');
    expect(healerOf(workingBy(quest(Q1), 'mender'), [mender])).toBe('doer');
    expect(healerOf(workingBy(quest(Q1), 'thorn'), [THORN, character('knot')])).toBe('doer');
    expect(healerOf(workingBy(quest(Q1), 'thorn'), [THORN, SALVE], { classes: [] })).toBe('doer');
  });

  it('never takes one who judged the quest or a quest of its party (ADR 0020)', () => {
    // The healer judged the party's other part: it may never become a doer of the party.
    const other = moved(inReview(quest(Q2, { party: Q2 }), 'gale'), 20, [
      'assign_verifier',
      'steward',
      { verifier: 'salve' },
    ]);
    const part = workingBy(quest(Q1, { party: Q2 }), 'thorn');
    expect(healerOf(part, [THORN, SALVE])).toBe('salve');
    expect(healerOf(part, [THORN, SALVE], { party: [other] })).toBe('doer');
  });
});
