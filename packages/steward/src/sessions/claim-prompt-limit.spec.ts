// A knight whose tribe cannot take the prompt of its start on this OS (fix/claim-step, (96) of the owner's settlement
// of 2026-11-14). On PS-07's kingdom (Windows, agy 1.5.8) knights' prompts ran to 51 134 characters, more than agy
// takes on its command line, and an agy knight given such a quest could not open its session: the quest went to the
// infirmary at its start (`breaker:no_session`). Now the Steward measures the prompt before the claim, as it does a
// judge's (prompt-limit.spec.ts), and the agy knight is passed over while another knight may take the quest.
import { afterEach, describe, expect, it } from 'vitest';

import { CAST, bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { Bench, CastMember } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';
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
  'agy takes its prompt on the command line, and this one would be about 51134 characters; Windows stops at 32767';

/** ilse, an agy knight, comes before thorn (same level, idle as long, its id first) while nobody tells them apart. */
const ILSE: CastMember = {
  id: 'ilse',
  cls: 'knight',
  tribe: 'gemini',
  model: 'gemini-3.8-flash-high',
  level: 5,
};
const JUDGES = CAST.filter(({ cls }) => cls === 'judge');

/** A runner whose CLI takes at most `max` characters of a prompt on Windows and refuses a longer one, as agy does. */
function limited(runner: AgentRunner, max: number, platform: string) {
  const tries: string[] = [];
  const spawn: AgentRunner['spawn'] = (req) => {
    if (req.role === 'assignee') tries.push(req.character.id);
    const tooLong = platform === 'win32' && req.prompt.user.length > max;
    return tooLong ? Promise.reject(new Error(TOO_LONG)) : runner.spawn(req);
  };
  const capabilities = { ...runner.capabilities, prompt_max_chars: { win32: max } };
  return { tries, runner: { ...runner, capabilities, spawn } };
}

async function open(platform: string, cast: readonly CastMember[]) {
  const kingdom = (current = await bench({ cast }));
  const gemini = limited(kingdom.runners.gemini, 50, platform);
  // Not a fresh literal at the call: the tribe ids are plain keys here, as in the bench's own overrides.
  const deps = { platform, runners: { claude: kingdom.runners.claude, gemini: gemini.runner } };
  running = kingdom.steward(deps);
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom, steward: running, tries: gemini.tries };
}

const assigneesOf = (quest: Quest) =>
  quest.attempt_log.filter(({ role }) => role === 'assignee').map(({ character }) => character);
const statusIs = (kingdom: Bench, title: string, status: Quest['status']) => async () =>
  (await kingdom.quest(title)).status === status;
const KNIGHTS = [ILSE, { id: 'thorn', cls: 'knight', level: 5 }, ...JUDGES];

describe('a knight whose tribe cannot take the prompt of its start on this OS', () => {
  it('is passed over, and the other knight takes the quest', async () => {
    const { kingdom, steward, tries } = await open('win32', KNIGHTS);
    await kingdom.command('create_quest', questPayload('Long brief'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Long brief', 'review'));
    expect(assigneesOf(await kingdom.quest('Long brief'))).toEqual(['thorn']);
    expect(tries).toEqual([]);
  });

  it('takes the quest as before where its tribe declares no limit', async () => {
    const { kingdom, steward, tries } = await open('darwin', KNIGHTS);
    await kingdom.command('create_quest', questPayload('On a Mac'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'On a Mac', 'review'));
    expect(assigneesOf(await kingdom.quest('On a Mac'))).toEqual(['ilse']);
    expect(tries).toEqual(['ilse']);
  });

  it('is still tried when no other knight may take the quest, and the start rings with the runner’s reason', async () => {
    const { kingdom, steward, tries } = await open('win32', [ILSE, ...JUDGES]);
    await kingdom.command('create_quest', questPayload('Nobody else'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Nobody else', 'infirmary'));
    expect(tries).toEqual(['ilse']);
    expect(kingdom.notices.filter(({ kind }) => kind === 'infirmary')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          code: 'breaker:no_session',
          params: expect.objectContaining({
            error: expect.stringMatching(/Windows stops at 32767$/) as unknown,
          }) as unknown,
        }) as unknown,
      }),
    ]);
  });
});
