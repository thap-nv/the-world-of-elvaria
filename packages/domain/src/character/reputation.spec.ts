import { describe, expect, it } from 'vitest';

import { TITLE_MIN_PCT, TITLE_MIN_VERDICTS } from './constants.ts';
import { affinityOf, reputationOf, titleOf } from './reputation.ts';
import type { TagId, VerdictId } from '../core/ids.ts';
import type { Character, VerdictEntry } from '../schema/character/character.ts';

const verdict = (result: 'pass' | 'fail', by_human = false): VerdictEntry => ({
  verdict_id: 'q_20261105_4c8n2d-1' as VerdictId,
  result,
  by_human,
  at: '2026-11-05T16:20:00+07:00',
});
const many = (count: number, result: 'pass' | 'fail') => Array.from({ length: count }, () => verdict(result));

const tag = (id: string) => id as TagId;
type Affinity = Character['skill_affinity'];
const affinity = (windows: Record<string, VerdictEntry[]>): Affinity =>
  Object.fromEntries(Object.entries(windows).map(([id, window]) => [id, { window }]));

describe('reputationOf', () => {
  it('has no rate before the first verdict', () => {
    expect(reputationOf([])).toEqual({ verdicts: 0, pct: null });
  });

  it('is the pass rate over the window', () => {
    expect(reputationOf([...many(3, 'pass'), verdict('fail')])).toEqual({ verdicts: 4, pct: 75 });
  });

  it("weighs the owner's verdict like three agent verdicts, and still counts it once", () => {
    expect(reputationOf([verdict('pass'), verdict('fail', true)])).toEqual({ verdicts: 2, pct: 25 });
    expect(reputationOf([verdict('fail'), verdict('pass', true)])).toEqual({ verdicts: 2, pct: 75 });
  });
});

describe('affinityOf', () => {
  const skills = affinity({ frontend: many(3, 'pass'), i18n: [verdict('fail')] });

  it("pools the windows of the quest's tags", () => {
    expect(affinityOf(skills, [tag('frontend'), tag('i18n')])).toEqual({ verdicts: 4, pct: 75 });
    expect(affinityOf(skills, [tag('frontend')])).toEqual({ verdicts: 3, pct: 100 });
  });

  it('knows nothing of a tag the character never worked on', () => {
    expect(affinityOf(skills, [tag('db')])).toEqual({ verdicts: 0, pct: null });
    expect(affinityOf(skills, [])).toEqual({ verdicts: 0, pct: null });
  });
});

describe('titleOf', () => {
  const proven = (passes: number, fails = 0) => [...many(passes, 'pass'), ...many(fails, 'fail')];

  it('is the pinned tag, whatever the windows say', () => {
    const skill_affinity = affinity({ frontend: proven(TITLE_MIN_VERDICTS) });
    expect(titleOf({ pinned_tag: tag('docs'), skill_affinity })).toBe('docs');
  });

  it('is none until a tag has the standing of a level-up', () => {
    expect(titleOf({ pinned_tag: null, skill_affinity: affinity({}) })).toBeNull();
    // One verdict short, and a rate under the bar.
    const skill_affinity = affinity({
      frontend: proven(TITLE_MIN_VERDICTS - 1),
      backend: proven(TITLE_MIN_VERDICTS - 2, 2),
    });
    expect(TITLE_MIN_PCT).toBeGreaterThan(80);
    expect(titleOf({ pinned_tag: null, skill_affinity })).toBeNull();
  });

  it('is the tag with the best rate, then the most verdicts, then the first id', () => {
    const best = affinity({ frontend: proven(11, 1), backend: proven(12), e2e: proven(10) });
    expect(titleOf({ pinned_tag: null, skill_affinity: best })).toBe('backend');
    const longer = affinity({ e2e: proven(10), backend: proven(12) });
    expect(titleOf({ pinned_tag: null, skill_affinity: longer })).toBe('backend');
    const even = affinity({ frontend: proven(10), backend: proven(10) });
    expect(titleOf({ pinned_tag: null, skill_affinity: even })).toBe('backend');
  });
});
