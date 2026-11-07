import { describe, expect, it } from 'vitest';

import { CLASSES, Q1, character, inReview, moved, quest } from './__fixtures__/snapshot.ts';
import { verifierFor } from './verifier-for.ts';
import type { Character } from '../schema/character/character.ts';

const THORN = character('thorn');
const submitted = inReview(quest(Q1), 'thorn');
const pick = (free: readonly Character[], assignee: Character | undefined = THORN) =>
  verifierFor(submitted, free, assignee, CLASSES)?.id;

describe('verifierFor (until selectVerifier, P1-04)', () => {
  it('takes a verifier class for the kind, never another class', () => {
    expect(pick([character('kael')])).toBeUndefined();
    expect(pick([character('kael'), character('sable', { cls: 'judge', model: 'claude-opus-5-5' })])).toBe(
      'sable',
    );
    const document = inReview(quest(Q1, { kind: 'research' }), 'thorn');
    expect(
      verifierFor(document, [character('sable', { cls: 'judge', model: 'claude-opus-5-5' })], THORN, CLASSES),
    ).toBeUndefined();
  });

  it('never takes the assignee, anyone who worked the quest, or the same model', () => {
    const reassigned = moved(
      submitted,
      30,
      ['verdict_fail', 'steward'],
      ['reassign', 'user', { assignee: 'kael', level: 3 }],
    );
    const judges = [
      character('thorn', { cls: 'judge', model: 'claude-opus-5-5' }),
      character('sable', { cls: 'judge' }),
    ];
    expect(verifierFor(reassigned, judges, character('kael'), CLASSES)).toBeUndefined();
  });

  it('prefers another tribe, then the one idle the longest; without the assignee file, any model', () => {
    const judges = [
      character('sable', { cls: 'judge', model: 'claude-opus-5-5', since: 0 }),
      character('orin', { cls: 'judge', tribe: 'gemini', since: 50 }),
    ];
    expect(pick(judges)).toBe('orin');
    expect(pick(judges.slice(0, 1))).toBe('sable');
    expect(verifierFor(submitted, [character('vale', { cls: 'judge' })], undefined, CLASSES)?.id).toBe(
      'vale',
    );
  });
});
