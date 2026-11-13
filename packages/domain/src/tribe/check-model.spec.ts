import { describe, expect, it } from 'vitest';

import { checkModelOf } from './check-model.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Tribe } from '../schema/tribe.ts';

const GEMINI = 'gemini' as TribeId;
const CLAUDE = 'claude' as TribeId;
/** The owner's kingdom on 2026-11-13: agy's Claude and GPT pool off, the tribe without a default model. */
const TRIBES = [
  { id: CLAUDE },
  { id: GEMINI, pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: false } } },
];
const member = (
  id: string,
  tribe: TribeId,
  model: string,
  status: Character['status'] = 'idle',
): Pick<Character, 'id' | 'tribe' | 'model' | 'status'> => ({ id: id as CharacterId, tribe, model, status });
const CAST = [
  member('vesper', CLAUDE, 'claude-opus-5-5'),
  member('maren', CLAUDE, 'claude-sonnet-5-5'),
  member('ilse', GEMINI, 'gemini-4-argon-medium'),
  member('kael', GEMINI, 'gemini-3.8-flash-high'),
  member('quill', GEMINI, 'gemini-3.8-flash-high'),
  member('ember', GEMINI, 'claude-opus-5-5-high', 'suspended'),
  member('wisp', GEMINI, 'claude-haiku-5-5'),
];

describe('checkModelOf', () => {
  it('takes the default model doctor pinned first', () => {
    const tool = {
      path: 'C:/agy/agy.exe',
      version: '1.5.7',
      auth: 'login',
      default_model: 'gemini-4-argon-low',
    };
    const tribe: Pick<Tribe, 'id' | 'tool'> = { id: GEMINI, tool: { ...tool, auth: 'login' } };
    expect(checkModelOf(tribe, TRIBES, CAST)).toEqual({ model: 'gemini-4-argon-low', from: 'default_model' });
  });

  it("else the cheapest model the tribe's own characters run, on a pool that is on and never a suspended one's", () => {
    expect(checkModelOf({ id: GEMINI }, TRIBES, CAST)).toEqual({
      model: 'gemini-3.8-flash-high',
      from: 'character',
      character: 'kael',
    });
    expect(checkModelOf({ id: CLAUDE }, TRIBES, CAST)).toMatchObject({ model: 'claude-sonnet-5-5' });
  });

  it('takes only a model the adapter serves, a model of no known level after the others', () => {
    const declared = [
      { id: 'gemini', family: 'gemini' },
      { id: 'claude-opus', starting_level: 5 },
    ];
    expect(checkModelOf({ id: GEMINI }, TRIBES, CAST, declared)).toMatchObject({
      model: 'gemini-3.8-flash-high',
    });
    const unknown = [member('a', CLAUDE, 'claude-next-2'), member('b', CLAUDE, 'claude-next-1')];
    expect(checkModelOf({ id: CLAUDE }, TRIBES, unknown)).toMatchObject({
      model: 'claude-next-1',
      character: 'b',
    });
  });

  it('finds none for a tribe with no default and no character to borrow one from', () => {
    expect(checkModelOf({ id: 'codex' as TribeId }, TRIBES, CAST)).toBeUndefined();
  });
});
