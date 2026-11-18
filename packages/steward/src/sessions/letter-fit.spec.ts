// fittedInput (fix/wrap-up-agy-codex): the letter goes by its path only when the tribe has a limit here, the session
// goes on from a letter, and the prompt that copies it is longer than the limit.
import { describe, expect, it } from 'vitest';

import { fittedInput } from './letter-fit.ts';
import type { Context } from '../context.ts';
import type { SessionInput } from './input.ts';

const INPUT = {
  character: { id: 'quill', tribe: 'agy' },
  quest: { id: 'q_20261117_m8d5t2' },
  continuation: { reason: 'revive' },
} as unknown as SessionInput;

const contextOf = (max?: number) =>
  ({ limits: { agy: max === undefined ? {} : { prompt_max_chars: max } } }) as unknown as Context;

/** 30 000 characters with the letter copied, 9 000 with its path; every call is counted. */
function measured() {
  const calls: boolean[] = [];
  const lengthOf = (_ctx: Context, input: SessionInput) => {
    calls.push(input.letterAsPath === true);
    return Promise.resolve(input.letterAsPath === true ? 9_000 : 30_000);
  };
  return { calls, lengthOf };
}

describe('fittedInput', () => {
  it('names the letter by its path when the copied letter makes the prompt longer than the tribe takes', async () => {
    const { calls, lengthOf } = measured();
    expect(await fittedInput(contextOf(26_000), INPUT, lengthOf)).toEqual({
      input: { ...INPUT, letterAsPath: true },
      chars: 9_000,
    });
    expect(calls).toEqual([false, true]);
  });

  it('copies the letter when the prompt fits, the limit included', async () => {
    const { calls, lengthOf } = measured();
    const fitted = await fittedInput(contextOf(30_000), INPUT, lengthOf);
    expect(fitted.input).toBe(INPUT);
    expect(fitted.chars).toBe(30_000);
    expect(calls).toEqual([false]);
  });

  it('measures nothing for a tribe without a limit here, nor for a first session', async () => {
    const { calls, lengthOf } = measured();
    expect(await fittedInput(contextOf(), INPUT, lengthOf)).toEqual({ input: INPUT });
    const first = { ...INPUT, continuation: null };
    expect(await fittedInput(contextOf(26_000), first, lengthOf)).toEqual({ input: first });
    expect(calls).toEqual([]);
  });
});
