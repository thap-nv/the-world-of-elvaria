// The measure of plans/learning-loop.md §8: the default registry against the 30 disruptions of the test suite.
import { describe, expect, inject, it } from 'vitest';

import { KIND_CASES } from './__fixtures__/kind-cases.ts';
import { linesOf } from './__fixtures__/lines.ts';
import { SUITE } from './__fixtures__/suite.ts';
import { disruptionsOf } from './disruptions-of.ts';
import { parseDisruptionKinds } from './parse.ts';
import type { Level, SuiteCase } from './__fixtures__/suite.ts';
import type { DisruptionKind } from '../schema/disruption/disruption-kind.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** packages/registry-default/disruptions.json, read by vitest.config.mjs. */
    defaultDisruptions: string;
  }
}

const parsed = parseDisruptionKinds(JSON.parse(inject('defaultDisruptions')));
const KINDS: readonly DisruptionKind[] = parsed.ok ? parsed.value : [];

/** Plan §8, column "after LL-01": recognised with their cause, and with a symptom at least. */
const TARGET_FULL = 9;
const SYMPTOM_TODAY = 18;
const SUITE_SIZE = 30;

function levelOf(entry: SuiteCase, kinds: readonly string[]): Level {
  if (entry.cause !== undefined && kinds.includes(entry.cause)) return 'full';
  return kinds.length > 0 ? 'partial' : 'none';
}

const readings = SUITE.map((entry) => {
  const found = disruptionsOf(entry.events, KINDS);
  return {
    entry,
    found,
    level: levelOf(
      entry,
      found.map((disruption) => disruption.kind),
    ),
  };
});
const count = (level: Level) => readings.filter((reading) => reading.level === level).length;

describe('the default registry', () => {
  it('parses', () => {
    expect(parsed.ok ? [] : parsed.error).toEqual([]);
  });

  it.each(Object.entries(KIND_CASES))('%s matches its chain and not the one beside it', (id, kindCase) => {
    expect(disruptionsOf(linesOf(kindCase.match), KINDS).map((disruption) => disruption.kind)).toContain(id);
    expect(disruptionsOf(linesOf(kindCase.miss), KINDS).map((disruption) => disruption.kind)).not.toContain(
      id,
    );
  });

  it('has a case for every kind and no case for a kind it lacks', () => {
    expect(Object.keys(KIND_CASES).sort()).toEqual(KINDS.map((kind) => kind.id).sort());
  });
});

describe('the test suite (plans/learning-loop.md §2)', () => {
  it(`has ${SUITE_SIZE} cases with distinct ids`, () => {
    expect(new Set(SUITE.map((entry) => entry.id)).size).toBe(SUITE_SIZE);
  });

  it.each(readings)('$entry.id: $entry.about', ({ entry, found, level }) => {
    expect(found.map((disruption) => disruption.kind)).toEqual(entry.kinds);
    expect(level).toBe(entry.level);
    for (const disruption of found) expect(disruption.evidence.length).toBeGreaterThan(0);
  });

  // The number the plan's measure reads (§8), in the test's name so every run prints it beside the hand score.
  const full = count('full');
  const symptom = full + count('partial');
  const scored = SUITE.filter((entry) => entry.scored === 'full').length;
  const name = `recognises ${full}/${SUITE_SIZE} with their cause (target ${TARGET_FULL}, hand score ${scored}), ${symptom}/${SUITE_SIZE} with a symptom`;
  it(name, () => {
    expect(full).toBe(TARGET_FULL);
    // Plan §8 expected 24: six hand-scored symptoms are a red check or a question, which no rule can tell from work.
    expect(symptom).toBe(SYMPTOM_TODAY);
  });
});
