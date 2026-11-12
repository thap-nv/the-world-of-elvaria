import { describe, expect, it } from 'vitest';

import { familyOf } from '../character/family.ts';
import {
  CLASSES,
  Q1,
  Q2,
  character,
  inReview,
  moved,
  quest,
  returnedTo,
} from '../dispatch/__fixtures__/snapshot.ts';
import { seeded } from '../quest/__fixtures__/quests.ts';
import { selectVerifier } from './select-verifier.ts';
import { partyOf, pastAssigneesOf } from './past-assignees-of.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { VerifierPolicy } from './select-verifier.ts';

const THORN = character('thorn');
const policyOf = (more: Partial<VerifierPolicy> = {}): VerifierPolicy => ({
  same_family: 'different_model',
  classes: CLASSES,
  doers: [THORN],
  party: [],
  free: (candidate) => candidate.status === 'idle',
  ...more,
});
const judge = (id: string, spec: Parameters<typeof character>[1] = {}) =>
  character(id, { cls: 'judge', model: 'claude-opus-5-5', ...spec });
const ORIN = judge('orin', { tribe: 'gemini', model: 'gemini-4-argon-medium' });
const SABLE = judge('sable');
const submitted = inReview(quest(Q1), 'thorn');

const chosen = (q: Quest, candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) => {
  const selection = selectVerifier(q, candidates, policyOf(more));
  if (selection === null) return null;
  return selection.reason === 'machine_only' ? 'machine' : [selection.character.id, selection.reason];
};

describe('selectVerifier', () => {
  it('takes a judge of another model family first, then the same family on another model', () => {
    expect(chosen(submitted, [SABLE, ORIN])).toEqual(['orin', 'other_family']);
    expect(chosen(submitted, [SABLE])).toEqual(['sable', 'same_family_other_model']);
  });

  it("never takes the assignee's model, a class that does not verify the kind, or a busy judge", () => {
    expect(chosen(submitted, [judge('twin', { model: 'claude-sonnet-5-5' })])).toBeNull();
    expect(chosen(quest(Q2, { kind: 'research' }), [ORIN])).toBeNull();
    expect(chosen(submitted, [{ ...ORIN, status: 'reviewing' }])).toBeNull();
  });

  it('never takes the model of anyone who worked the quest, not only of the last run (P1-55)', () => {
    // The last run was the Steward's own, so there is no assignee: the knights of the runs before name the models.
    const sonnet = judge('twin', { model: 'claude-sonnet-5-5' });
    const opus = judge('opus-judge', { model: 'claude-opus-5-5' });
    const earlier = character('maren', { model: 'claude-opus-5-5' });
    expect(chosen(submitted, [sonnet, opus], { doers: [THORN] })).toEqual([
      'opus-judge',
      'same_family_other_model',
    ]);
    expect(chosen(submitted, [sonnet, opus], { doers: [THORN, earlier] })).toBeNull();
    // A judge is of another family only when it is of no doer's family, not of the last one's alone.
    const gemini = judge('orin2', { tribe: 'gemini', model: 'gemini-4-argon-medium' });
    const geminiKnight = character('quill', { tribe: 'gemini', model: 'gemini-4-argon-low' });
    expect(chosen(submitted, [gemini], { doers: [THORN] })).toEqual(['orin2', 'other_family']);
    expect(chosen(submitted, [gemini], { doers: [THORN, geminiKnight] })).toEqual([
      'orin2',
      'same_family_other_model',
    ]);
    const machineOnly = { doers: [THORN, geminiKnight], same_family: 'machine_only' } as const;
    expect(chosen(submitted, [sonnet, gemini], machineOnly)).toBe('machine');
  });

  it('never takes anyone who worked the quest, even one the owner took it away from', () => {
    const handedOver = moved(returnedTo(quest(Q1), 'orin'), 20, [
      'reassign',
      'user',
      { assignee: 'thorn', level: 3 },
    ]);
    expect(chosen(handedOver, [ORIN, SABLE])).toEqual(['sable', 'same_family_other_model']);
  });

  it('never takes a worker of any quest of the party (ADR 0020)', () => {
    const contract = inReview(quest(Q2, { party: Q2 }), 'orin');
    const part = inReview(quest(Q1, { party: Q2 }), 'thorn');
    expect(pastAssigneesOf(part, partyOf(part, [contract, part]))).toEqual(new Set(['thorn', 'orin']));
    expect(chosen(part, [ORIN, SABLE], { party: partyOf(part, [contract, part]) })).toEqual([
      'sable',
      'same_family_other_model',
    ]);
    expect(partyOf(submitted, [contract, submitted])).toEqual([]);
  });

  it('prefers another tribe, then the judge idle the longest', () => {
    const viaAgy = judge('vela', { tribe: 'gemini', since: 30 });
    const early = judge('early', { since: 0 });
    expect(chosen(submitted, [early, viaAgy])).toEqual(['vela', 'same_family_other_model']);
    expect(chosen(submitted, [judge('late', { since: 40 }), early])).toEqual([
      'early',
      'same_family_other_model',
    ]);
  });

  it('prefers, among judges otherwise equal, a tribe whose CLI hands in a structured verdict (P1-33)', () => {
    const lantern = judge('wick', { tribe: 'lantern', model: 'gpt-6', since: 0 });
    const codex = judge('ash', { tribe: 'codex', model: 'gpt-6-mini', since: 30 });
    const limits = {
      lantern: { structured_output: 'prompt_and_parse' },
      codex: { structured_output: 'native' },
    } as const;
    // Idle the longest, but it answers in text: the judge that hands in a structured verdict goes first.
    expect(chosen(submitted, [lantern, codex], { limits })).toEqual(['ash', 'other_family']);
    expect(chosen(submitted, [lantern, codex])).toEqual(['wick', 'other_family']);
    // The family and the tribe still come first: a text judge of another family beats a structured one of the same.
    expect(chosen(submitted, [SABLE, lantern], { limits })).toEqual(['wick', 'other_family']);
    const viaAgy = judge('vela', { tribe: 'gemini', since: 30 });
    const inText = {
      claude: { structured_output: 'native' },
      gemini: { structured_output: 'prompt_and_parse' },
    } as const;
    expect(chosen(submitted, [judge('early', { since: 0 }), viaAgy], { limits: inText })).toEqual([
      'vela',
      'same_family_other_model',
    ]);
  });

  it('under machine_only waits for a judge of another family while one serves, else lets the machine judge', () => {
    const machineOnly = { same_family: 'machine_only' as const };
    expect(chosen(submitted, [SABLE, { ...ORIN, status: 'working' }], machineOnly)).toBeNull();
    expect(chosen(submitted, [SABLE], machineOnly)).toBe('machine');
    expect(chosen(submitted, [], machineOnly)).toBe('machine');
    expect(chosen(submitted, [SABLE, ORIN], machineOnly)).toEqual(['orin', 'other_family']);
  });

  it("judges any family's work when the assignee's file is gone", () => {
    expect(chosen(submitted, [SABLE], { doers: [] })).toEqual(['sable', 'other_family']);
  });
});

/** The review after `verifier` judged it and a breaker stopped it at minute `minute`. */
const cutOnce = (base: Quest, verifier: string, minute: number): Quest =>
  moved(
    base,
    minute,
    ['assign_verifier', 'steward', { verifier }],
    ['breaker', 'steward', { trip: 'tokens' }],
  );

// P1-38, P1-35 (d): ilse, cut by the token breaker, was chosen again at once in the P1-35 run.
describe('selectVerifier after a breaker stopped a judge of the run', () => {
  const cut = cutOnce(submitted, 'orin', 20);
  const ASH = judge('ash', { tribe: 'codex', model: 'gpt-6' });

  it('does not choose it again while another judge may take the review, even of the same family', () => {
    expect(chosen(cut, [ORIN, SABLE])).toEqual(['sable', 'same_family_other_model']);
    expect(chosen(cut, [ORIN, SABLE, ASH])).toEqual(['ash', 'other_family']);
    // The other judge is busy: the review waits for it rather than the judge just cut.
    expect(chosen(cut, [ORIN, { ...SABLE, status: 'reviewing' }])).toBeNull();
  });

  it('chooses it again when nobody else may ever take the review: REVIEW_BREAKS_MAX bounds it', () => {
    expect(chosen(cut, [ORIN])).toEqual(['orin', 'other_family']);
    // Under machine_only a judge of the same family never judges, so it does not count as another one.
    const machineOnly = { same_family: 'machine_only' as const };
    expect(chosen(cut, [ORIN, SABLE], machineOnly)).toEqual(['orin', 'other_family']);
    expect(chosen(cut, [ORIN, SABLE, ASH], machineOnly)).toEqual(['ash', 'other_family']);
    expect(chosen(cut, [ORIN, SABLE, { ...ASH, status: 'working' }], machineOnly)).toBeNull();
  });

  it("chooses it again after the owner's retry of a stalled review", () => {
    const stalled = cutOnce(cut, 'sable', 30);
    const retried = moved(stalled, 35, ['breaker', 'steward', { trip: 'tokens' }], ['retry', 'user']);
    expect(retried).toMatchObject({ status: 'review', verifier: null });
    expect(chosen(retried, [ORIN, SABLE])).toEqual(['orin', 'other_family']);
  });
});

/** The review after `verifier` judged it and handed in a partial verdict at minute `minute`. */
const readPart = (base: Quest, verifier: string, minute: number): Quest =>
  moved(base, minute, ['assign_verifier', 'steward', { verifier }], ['verdict_partial', 'verifier']);

// P1-48, P1-42 (c): the judge that just handed in a partial verdict is not the next one while another may be.
describe('selectVerifier after a partial verdict', () => {
  const partial = readPart(submitted, 'orin', 20);

  it('takes another judge, or waits for one, while another may take the review', () => {
    expect(chosen(partial, [ORIN, SABLE])).toEqual(['sable', 'same_family_other_model']);
    expect(chosen(partial, [ORIN, { ...SABLE, status: 'reviewing' }])).toBeNull();
  });

  it('takes it again when nobody else may, or once another judge came after it', () => {
    expect(chosen(partial, [ORIN])).toEqual(['orin', 'other_family']);
    const crashedAfter = moved(
      partial,
      30,
      ['assign_verifier', 'steward', { verifier: 'sable' }],
      ['crash', 'steward'],
    );
    expect(chosen(crashedAfter, [ORIN, SABLE])).toEqual(['orin', 'other_family']);
    expect(chosen(readPart(partial, 'sable', 30), [ORIN, SABLE])).toEqual(['orin', 'other_family']);
  });
});

// P1-48, P1-16 (l): "Opus from rank B", by the judge's level (P1-38), below the separation rules.
describe('selectVerifier by rank', () => {
  const FLASH = judge('ilse', { tribe: 'gemini', model: 'gemini-3.8-flash-high', level: 2, since: 0 });
  const PRO = judge('wren', { tribe: 'gemini', model: 'gemini-3.5-pro', level: 4, since: 30 });
  const ofRank = (rank: string): Quest => inReview(quest(Q1, { rank }), 'thorn');

  it('takes the stronger judge first on a quest of rank B or above', () => {
    expect(chosen(ofRank('B'), [FLASH, PRO])).toEqual(['wren', 'other_family']);
    expect(chosen(ofRank('S'), [FLASH, PRO])).toEqual(['wren', 'other_family']);
  });

  it('chooses as before below rank B, or when the judges are equally strong', () => {
    expect(chosen(ofRank('C'), [FLASH, PRO])).toEqual(['ilse', 'other_family']);
    expect(chosen(ofRank('B'), [FLASH, { ...PRO, level: 2 }])).toEqual(['ilse', 'other_family']);
  });

  it('never puts strength before the family or the tribe', () => {
    const opus = judge('vesper', { level: 5 });
    expect(chosen(ofRank('A'), [FLASH, opus])).toEqual(['ilse', 'other_family']);
    const kael = character('kael', { tribe: 'gemini', model: 'gemini-3.8-flash-high' });
    const viaAgy = judge('brann', { tribe: 'gemini', level: 5, since: 0 });
    const weakOther = judge('sable', { model: 'claude-sonnet-5-5', level: 2, since: 30 });
    const ofKael = inReview(quest(Q1, { rank: 'B' }), 'kael');
    expect(chosen(ofKael, [viaAgy, weakOther], { doers: [kael] })).toEqual(['sable', 'other_family']);
  });
});

/** A random kingdom: judges and knights of three families, some busy, two of them past assignees of the quest. */
function roster(next: () => number): { quest: Quest; candidates: Character[]; assignee: Character } {
  const models = ['claude-sonnet-5-5', 'claude-opus-5-5', 'gemini-4-argon-medium', 'gpt-oss-120b-medium'];
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const candidates = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, index) =>
    character(`c${String(index)}`, {
      cls: pick(['judge', 'judge', 'knight']),
      model: pick(models),
      tribe: pick(['claude', 'gemini']),
      status: pick(['idle', 'idle', 'working']),
      since: Math.floor(next() * 60),
    }),
  );
  const assignee = pick(candidates);
  const earlier = pick(candidates);
  const base = returnedTo(quest(Q1), earlier.id);
  const handed = moved(base, 20, ['reassign', 'user', { assignee: assignee.id, level: 3 }]);
  return { quest: moved(handed, 21, ['start', 'steward'], ['submit', 'runner']), candidates, assignee };
}

/** What must hold of one selection on one random roster, whatever the policy. */
function checkSelection(seed: number, same_family: VerifierPolicy['same_family']): void {
  const { quest: q, candidates, assignee } = roster(seeded(seed));
  const selection = selectVerifier(q, candidates, policyOf({ same_family, doers: [assignee] }));
  const free = candidates.filter(
    (c) =>
      c.class === 'judge' &&
      c.status === 'idle' &&
      !pastAssigneesOf(q).has(c.id) &&
      c.model !== assignee.model,
  );
  const otherFree = free.some((c) => familyOf(c.model) !== familyOf(assignee.model));
  if (selection === null || selection.reason === 'machine_only') {
    expect(otherFree).toBe(false);
    if (same_family === 'different_model') expect(free).toEqual([]);
    return;
  }
  expect(free).toContain(selection.character);
  expect(selection.reason === 'other_family').toBe(otherFree);
  expect(same_family === 'machine_only' && !otherFree).toBe(false);
}

describe('selectVerifier over random rosters (property)', () => {
  it('never picks a worker, the same model, a busy character or a non-judge; another family whenever one is free', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      checkSelection(seed, 'different_model');
      checkSelection(seed, 'machine_only');
    }
  });
});
