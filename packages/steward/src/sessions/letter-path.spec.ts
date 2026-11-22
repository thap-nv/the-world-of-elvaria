// An assignee that goes on after a cut, of a tribe that takes a shorter prompt on this OS than its letter makes
// (fix/stop-letter (3), the owner's choice in fix/wrap-up-agy-codex). The prompt copied the letter word for word, so
// on Windows an agy session with a long letter could not open, and the quest went to the infirmary
// (`breaker:no_session`). Now the prompt names the letter's path when it must, and the session opens.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { plotsOf } from '../__fixtures__/cuts.ts';
import { bench, questPayload } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';
import type { AgentRunner } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** Above the bench's prompts with a short letter, below the one that copies LETTER. */
const MAX = 60_000;
const LINE = 'The parser reads the header of each record; the body is next, then the checks. ';
const LETTER = `# Where I am\n\n${LINE.repeat(1_200)}`;
/** Rank D: 45 minutes, cut at 150 %. */
const HARD = 67.5;

/** A runner whose CLI refuses a prompt longer than MAX on Windows, as agy's command line does. */
const limited = (runner: AgentRunner, platform: string): AgentRunner => ({
  ...runner,
  capabilities: { ...runner.capabilities, prompt_max_chars: { win32: MAX } },
  spawn: (req) =>
    platform === 'win32' && req.prompt.user.length > MAX
      ? Promise.reject(new Error(`the prompt is ${String(req.prompt.user.length)} characters`))
      : runner.spawn(req),
});

/** A quest cut at the hard ceiling with a new commit, its letter LETTER, then the tick that goes on with it. */
async function goesOnWithLongLetter(platform: string) {
  const kingdom = (current = await bench({ plays: { work: { Parser: ['hang', 'hang', 'hang'] } } }));
  const { claude, gemini } = kingdom.runners;
  const runners = { claude: limited(claude, platform), gemini: limited(gemini, platform) };
  running = kingdom.steward({ platform, runners, plots: plotsOf(kingdom, true) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await kingdom.command('create_quest', questPayload('Parser'));
  await running.tick();
  kingdom.clock.advance(HARD);
  await running.tick();
  const cut = await kingdom.quest('Parser');
  expect(cut.status).toBe('returned');
  await writeFile(path.join(kingdom.root, 'quests', cut.id, 'handover.md'), LETTER, 'utf8');
  await running.tick();
  const user = kingdom.requests.filter(({ role }) => role === 'assignee').at(-1)?.prompt.user ?? '';
  return { kingdom, quest: await kingdom.quest('Parser'), user };
}

describe('a continuing assignee whose letter makes the prompt longer than its tribe takes', () => {
  it('reads the letter by its path, and its session opens', async () => {
    const { kingdom, quest, user } = await goesOnWithLongLetter('win32');
    expect(quest).toMatchObject({ status: 'working', attempts: 1 });
    expect(quest.attempt_log).toMatchObject([{ n: 1 }, { n: 1 }]);
    expect(user).toContain(
      'Not copied here: with the letter in it, this prompt would be longer than your CLI takes.',
    );
    expect(user).toContain(path.join('quests', quest.id, 'handover.md'));
    expect(user).not.toContain(LINE);
    expect(user.length).toBeLessThanOrEqual(MAX);
    expect(kingdom.warnings.join('\n')).toMatch(/prompt names the letter's path, \d+ characters/);
    expect(kingdom.notices).toEqual([]);
  });

  it('copies the letter where its tribe declares no limit', async () => {
    const { quest, user } = await goesOnWithLongLetter('darwin');
    expect(quest.status).toBe('working');
    expect(user).toContain(LETTER.slice(0, 200));
    expect(user).not.toContain('Not copied here');
    expect(user.length).toBeGreaterThan(MAX);
  });
});
