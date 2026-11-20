import { describe, expect, it } from 'vitest';

import { PAYLOADS, SESSION } from '../__fixtures__/claude-payloads.ts';
import { translateCodex } from '../codex/translate.ts';
import { loadContext } from '../context.ts';
import { translateClaude } from './translate.ts';

describe('Claude session effort', () => {
  it('preserves Codex session data through the shared handler', () => {
    const ctx = { ...loadContext({}, []), model: 'gpt-6-high' };
    expect(translateCodex({ ...PAYLOADS.SessionStart, model: 'gpt-6-high' }, ctx).drafts).toEqual([
      { type: 'agent.session.start', data: { session: SESSION, model: 'gpt-6-high' } },
    ]);
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])(
    'records %s from runner context even when the CLI reports the base model',
    (effort) => {
      const ctx = { ...loadContext({}, []), model: `claude-opus-5-5-${effort}` };
      for (const model of [undefined, 'claude-opus-5-5']) {
        const translated = translateClaude({ ...PAYLOADS.SessionStart, model }, ctx);
        expect(translated.drafts).toEqual([
          { type: 'agent.session.start', data: { session: SESSION, model: 'claude-opus-5-5', effort } },
        ]);
      }
    },
  );

  it.each(['claude-haiku-5-5', 'claude-opus-5-5-ultra'])(
    'keeps %s without a Claude effort suffix unchanged',
    (model) => {
      const ctx = { ...loadContext({}, []), model };
      expect(translateClaude({ ...PAYLOADS.SessionStart, model: undefined }, ctx).drafts).toEqual([
        { type: 'agent.session.start', data: { session: SESSION, model } },
      ]);
    },
  );
});
