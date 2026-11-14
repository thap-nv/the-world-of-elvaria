// A session its CLI refuses before any model call (fix/amendment-schema): Claude Code 2.1.322 printed the API's answer
// as the session's only text and ended in error with 0 tokens when the amendment's schema had an `allOf` at its top
// (M2, 2026-11-14). Shared by the specs of `elvaria say` and of the amendments' authors.
import { createFakeRunner, createSignalChannel } from '@elvaria/runner-core';
import type { AgentRunner, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

export const REFUSAL =
  'API Error: 400 tools.1.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the top level';

/** The session's one text signal, then its end. */
function said(text: string): AsyncIterable<RunnerSignal> {
  const signals = createSignalChannel<RunnerSignal>();
  signals.push({ kind: 'text', text });
  signals.close();
  return signals.iterable;
}

/** A runner whose sessions say `text` and end in error with no reply and no token, and the requests it was given. */
export function refusing(
  text = `${REFUSAL}\n(request req_fake)`,
): AgentRunner & { readonly heard: SpawnRequest[] } {
  const fake = createFakeRunner();
  const heard: SpawnRequest[] = [];
  return {
    ...fake,
    heard,
    spawn: async (req) => {
      heard.push(req);
      const session = await fake.spawn(req);
      const result = await session.wait();
      return {
        ...session,
        signals: said(text),
        wait: () => Promise.resolve({ ...result, outcome: 'error', exit_code: 1, usage: { tokens: 0 } }),
      };
    },
  };
}
