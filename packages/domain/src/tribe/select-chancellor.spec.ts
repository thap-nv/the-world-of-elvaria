import { describe, expect, it } from 'vitest';

import { character } from '../dispatch/__fixtures__/snapshot.ts';
import { CHANCELLOR_CLASS, pickChancellor, selectChancellor } from './select-chancellor.ts';
import { FULL_TRIBE_LIMITS } from './tribe-limits.ts';
import type { TribeId } from '../core/ids.ts';
import type { LimitsByTribe } from './select-chancellor.ts';
import type { TribeHold } from './version-hold.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;

const NATIVE = FULL_TRIBE_LIMITS;
const PARSED = { ...FULL_TRIBE_LIMITS, structured_output: 'prompt_and_parse' as const };
const BOTH: LimitsByTribe = { [CLAUDE]: NATIVE, [GEMINI]: PARSED };

const chancellor = (id: string, tribe: string, level = 3, status: 'idle' | 'sleeping_mana' = 'idle') =>
  character(id, { cls: 'chancellor', tribe, level, status });

const chosen = (...args: Parameters<typeof selectChancellor>) => selectChancellor(...args)?.character.id;

describe('selectChancellor (§10 question 6)', () => {
  it('names the class of the Chancellor', () => {
    expect(CHANCELLOR_CLASS).toBe('chancellor');
  });

  it('prefers a tribe with structured output, and says how the drafts come back', () => {
    const roster = [chancellor('vesna', 'gemini', 9), chancellor('aldric', 'claude', 1)];
    expect(selectChancellor(roster, BOTH)).toEqual({ character: roster[1], structured_output: 'native' });
  });

  it('lets a tribe without structured output speak when no ready tribe has it', () => {
    const roster = [chancellor('vesna', 'gemini'), chancellor('aldric', 'claude', 3, 'sleeping_mana')];
    expect(selectChancellor(roster, BOTH)).toEqual({
      character: roster[0],
      structured_output: 'prompt_and_parse',
    });
    expect(
      chosen([chancellor('vesna', 'gemini'), chancellor('aldric', 'claude')], { [GEMINI]: PARSED }),
    ).toBe('vesna');
  });

  it('takes the highest level, then the first id', () => {
    const roster = [
      chancellor('corin', 'claude', 4),
      chancellor('bram', 'claude', 6),
      chancellor('aldric', 'claude', 6),
    ];
    expect(chosen(roster, BOTH)).toBe('aldric');
    expect(chosen([roster[2]!, roster[1]!], BOTH)).toBe('aldric');
  });

  it('hears nobody who is not an idle chancellor of a tribe that runs', () => {
    const others = [
      character('thorn', { cls: 'knight' }),
      chancellor('aldric', 'claude', 3, 'sleeping_mana'),
      chancellor('vesna', 'gemini'),
    ];
    expect(selectChancellor(others, { [CLAUDE]: NATIVE })).toBeUndefined();
    expect(
      selectChancellor([chancellor('aldric', 'claude')], { [CLAUDE]: { ...NATIVE, enabled: false } }),
    ).toBe(undefined);
    expect(selectChancellor([], BOTH)).toBeUndefined();
  });
});

describe('pickChancellor (fix/held-tribe-sessions)', () => {
  const hold = (tribe: TribeId): TribeHold => ({
    tribe,
    path: 'C:/cli.exe',
    version: '1.5.8',
    checked: '1.5.7',
  });
  const roster = [chancellor('aldric', 'claude', 6), chancellor('vesna', 'gemini', 2)];

  it('is selectChancellor when no tribe is held', () => {
    expect(pickChancellor(roster, BOTH, [])).toEqual({
      status: 'chosen',
      choice: { character: roster[0], structured_output: 'native' },
    });
  });

  it('gives way to the next Chancellor by the same rule when the first one is of a held tribe', () => {
    expect(pickChancellor(roster, BOTH, [hold(CLAUDE)])).toEqual({
      status: 'chosen',
      choice: { character: roster[1], structured_output: 'prompt_and_parse' },
    });
  });

  it('names the holds that keep every Chancellor who could speak, and only those', () => {
    const holds = [hold(CLAUDE), hold(GEMINI), hold('codex' as TribeId)];
    expect(pickChancellor(roster, BOTH, holds)).toEqual({ status: 'held', holds: holds.slice(0, 2) });
    // A sleeping Chancellor of a held tribe could not speak anyway: nobody waits on its check.
    const asleep = [chancellor('aldric', 'claude', 6, 'sleeping_mana')];
    expect(pickChancellor(asleep, BOTH, [hold(CLAUDE)])).toEqual({ status: 'none' });
    expect(pickChancellor([], BOTH, [])).toEqual({ status: 'none' });
  });
});
