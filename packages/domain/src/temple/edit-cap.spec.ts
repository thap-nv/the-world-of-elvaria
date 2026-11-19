import { describe, expect, it } from 'vitest';

import { LessonIdSchema } from '../core/ids.ts';
import { scriptureEditOf } from './edit.ts';
import {
  JUDGE,
  KNIGHT,
  addOf,
  factsOf,
  fileOf,
  mergeOf,
  monkFileOf,
  monkId,
  scopeOf,
  stateOf,
} from './__fixtures__/report.ts';
import type { ScriptureOperation } from '../schema/temple/operation.ts';
import type { TempleState } from './refusal.ts';

const refusalOf = (state: TempleState, operation: ScriptureOperation, facts = factsOf()) => {
  const result = scriptureEditOf(state, operation, facts);
  return result.ok ? undefined : result.error;
};

/** The state with the operation applied, its files written over the old ones. */
function after(state: TempleState, operation: ScriptureOperation): TempleState {
  const result = scriptureEditOf(state, operation, factsOf());
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  const { files } = result.value;
  return {
    ...state,
    files: state.files.map((file) => files.find(({ owner }) => owner === file.owner) ?? file),
  };
}

describe('scriptureEditOf: the 41st line (DB4)', () => {
  // Forty lines of the Monk for the claude tribe: thorn's heaviest session loads them all.
  const full = monkFileOf('temple', 40, 1, '{tribe=claude} ');
  const state = stateOf([full, fileOf('thorn', []), fileOf('vale', [])]);

  it('refuses a line in the same scope, and lets one for another tribe through', () => {
    expect(refusalOf(state, addOf({ scope: scopeOf({ tribe: ['claude'] }) }))).toEqual({ code: 'over_cap' });
    expect(refusalOf(state, addOf())).toEqual({ code: 'over_cap' });
    expect(refusalOf(state, addOf({ scope: scopeOf({ tribe: ['codex'] }) }))).toBeUndefined();
  });

  it('lets the line through once a merge of two made room', () => {
    const merge = mergeOf([monkId(1), monkId(2)], { scope: scopeOf({ tribe: ['claude'] }) });
    const merged = after(state, merge);
    const facts = factsOf({ id: LessonIdSchema.parse('L_20261119_n3wn3x') });
    expect(refusalOf(merged, addOf({ scope: scopeOf({ tribe: ['claude'] }) }), facts)).toBeUndefined();
  });

  it('weighs a suspended character only for its own scripture', () => {
    const suspended = stateOf(
      [full, fileOf('thorn', []), fileOf('vale', [])],
      [{ ...KNIGHT, suspended: true }, JUDGE],
    );
    expect(refusalOf(suspended, addOf())).toBeUndefined();
    expect(refusalOf(suspended, addOf({ owner: 'thorn' }))).toEqual({ code: 'over_cap' });
  });
});
