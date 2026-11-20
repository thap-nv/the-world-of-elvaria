import { describe, expect, it } from 'vitest';

import { at, lineOf } from '../metrics/__fixtures__/ledger.ts';
import { shouldSkipTempleSession } from './skip.ts';

const HASH = 'ab'.repeat(32);
const ran = (data: Record<string, unknown>) => lineOf('temple.ran', data, at(0));
const session = ran({ tribe: 'gemini', evidence_hash: HASH });

describe('shouldSkipTempleSession', () => {
  it('never skips the owner, but skips every scheduled trigger on matching evidence', () => {
    expect(shouldSkipTempleSession({ trigger: 'owner', evidenceHash: HASH, events: [session] })).toBe(false);
    for (const trigger of ['quests', 'weekly', 'suspension'] as const)
      expect(shouldSkipTempleSession({ trigger, evidenceHash: HASH, events: [session] })).toBe(true);
  });

  it('uses the last model session, ignoring other events and sessionless runs', () => {
    const events = [
      session,
      ran({ session: 's2', evidence_hash: 'cd'.repeat(32) }),
      ran({ evidence_hash: HASH }),
    ];
    events.push(lineOf('verdict.fail', {}, at(1)));
    expect(shouldSkipTempleSession({ trigger: 'quests', evidenceHash: HASH, events })).toBe(false);
    expect(shouldSkipTempleSession({ trigger: 'quests', evidenceHash: 'cd'.repeat(32), events })).toBe(true);
  });

  it('runs with no prior model session or when the latest model session predates hashes', () => {
    for (const events of [[], [ran({ evidence_hash: HASH })], [session, ran({ tribe: 'gemini' })]])
      expect(shouldSkipTempleSession({ trigger: 'weekly', evidenceHash: HASH, events })).toBe(false);
  });
});
