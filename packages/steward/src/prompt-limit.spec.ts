// A judge whose tribe cannot take the review's prompt on this OS (fix/verifier-prompt-limit). On PS-07's kingdom
// (Windows, agy 1.5.8) every judge's prompt was longer than agy takes on its command line, and the agy judge was
// chosen anyway: since fix/review-no-session its session that cannot open leaves the review, but takes one of the
// review's REVIEW_BREAKS_MAX. Now the Steward measures the prompt before the tick, and the agy judge is passed over.
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { AgentRunner } from '@elvaria/runner-core';
import type { Quest } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** What agy says when the line is too long, as runner-antigravity's commandLineProblem words it. */
const TOO_LONG =
  'agy takes its prompt on the command line, and this one would be about 39636 characters; Windows stops at 32767';

/**
 * A runner whose CLI takes at most `max` characters of a judge's prompt on Windows, and refuses a longer one as agy
 * does (the knight's session is not what these cases look at); `tries` names the judges it was asked to open.
 */
function limited(runner: AgentRunner, max: number) {
  const tries: string[] = [];
  const spawn: AgentRunner['spawn'] = (req) => {
    if (req.role !== 'verifier') return runner.spawn(req);
    tries.push(req.character.id);
    return req.prompt.user.length > max ? Promise.reject(new Error(TOO_LONG)) : runner.spawn(req);
  };
  const capabilities = { ...runner.capabilities, prompt_max_chars: { win32: max } };
  return { tries, runner: { ...runner, capabilities, spawn } };
}

async function open(platform: string, limits: { readonly claude?: number; readonly gemini: number }) {
  const kingdom = (current = await bench());
  const gemini = limited(kingdom.runners.gemini, limits.gemini);
  const claude = limits.claude === undefined ? undefined : limited(kingdom.runners.claude, limits.claude);
  // Not a fresh literal at the call: the tribe ids are plain keys here, as in the bench's own overrides.
  const deps = {
    platform,
    runners: { claude: claude?.runner ?? kingdom.runners.claude, gemini: gemini.runner },
  };
  running = kingdom.steward(deps);
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom, steward: running, tries: { gemini: gemini.tries, claude: claude?.tries ?? [] } };
}

const judgesOf = (quest: Quest) =>
  quest.attempt_log
    .filter(({ role }) => role === 'verifier')
    .map(({ character, outcome }) => [character, outcome]);
const statusIs = (kingdom: Bench, title: string, status: Quest['status']) => async () =>
  (await kingdom.quest(title)).status === status;

describe('a judge whose tribe cannot take the prompt on this OS', () => {
  it('is passed over, and the next judge judges without a session lost (PS-07 (B))', async () => {
    const { kingdom, steward, tries } = await open('win32', { gemini: 50 });
    await kingdom.command('create_quest', questPayload('Long diff'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Long diff', 'done'));
    // orin (gemini) is of another family than the knight, so it would come first; sable (claude) judges instead.
    expect(judgesOf(await kingdom.quest('Long diff'))).toEqual([['sable', 'submitted']]);
    expect(tries.gemini).toEqual([]);
  });

  it('is chosen as before where its tribe declares no limit, or the prompt fits', async () => {
    const elsewhere = await open('darwin', { gemini: 50 });
    await elsewhere.kingdom.command('create_quest', questPayload('On a Mac'));
    await tickUntil(
      elsewhere.steward,
      elsewhere.kingdom.clock,
      statusIs(elsewhere.kingdom, 'On a Mac', 'review'),
    );
    await tickUntil(elsewhere.steward, elsewhere.kingdom.clock, () =>
      Promise.resolve(elsewhere.tries.gemini.length > 0),
    );
    expect(elsewhere.tries.gemini).toEqual(['orin']);
  });

  it('is still tried when no judge can take it, and the review rings with the runner’s reason', async () => {
    const { kingdom, steward, tries } = await open('win32', { claude: 50, gemini: 50 });
    await kingdom.command('create_quest', questPayload('Nobody fits'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Nobody fits', 'infirmary'));
    expect(judgesOf(await kingdom.quest('Nobody fits'))).toEqual([
      ['orin', 'no_session'],
      ['sable', 'no_session'],
    ]);
    expect([...tries.gemini, ...tries.claude]).toEqual(['orin', 'sable']);
    expect(kingdom.notices.filter(({ kind }) => kind === 'infirmary')).toEqual([
      expect.objectContaining({
        trip: 'no_verdict',
        reason: expect.objectContaining({
          code: 'judge:no_session',
          params: expect.objectContaining({
            error: expect.stringMatching(/Windows stops at 32767$/) as unknown,
          }) as unknown,
        }) as unknown,
      }),
    ]);
  });
});
