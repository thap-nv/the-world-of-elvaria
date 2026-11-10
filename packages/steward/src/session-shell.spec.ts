// The shell a session runs commands in (P1-40): the Steward takes the one its tribe's adapter declares for the OS it
// runs on (`capabilities.shell`, shellOf) and the prompt names it; an adapter that declares none, or not for this
// OS, leaves the prompt without it. The kingdom's scripture said it before, for the gemini tribe on Windows only.
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { AgentRunner } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const POWERSHELL = 'Windows PowerShell (powershell.exe)';
const withShell = (runner: AgentRunner, win32: string): AgentRunner => ({
  ...runner,
  capabilities: { ...runner.capabilities, shell: { win32 } },
});

/** A quest worked by kael (claude) and judged by orin (gemini), on `platform`. */
async function judgedOn(platform: string) {
  current = await bench({
    cast: [
      { id: 'kael', cls: 'knight' },
      { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
    ],
  });
  const { claude, gemini } = current.runners;
  const runners = { claude: withShell(claude, 'Git Bash'), gemini: withShell(gemini, POWERSHELL) };
  running = current.steward({ platform, runners });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Shell words'));
  await tickUntil(running, current.clock, statusIs(current, 'Shell words', 'done'));
  const systemOf = (role: string) => current?.requests.find((req) => req.role === role)?.prompt.system ?? '';
  return { assignee: systemOf('assignee'), verifier: systemOf('verifier') };
}

describe('the shell in the prompt (P1-40)', () => {
  it("names each tribe's shell on Windows: bash to the claude knight, PowerShell to the agy judge", async () => {
    const { assignee, verifier } = await judgedOn('win32');
    expect(assignee).toContain('Your shell is Git Bash: write each command in its syntax.');
    expect(verifier).toContain(`Your shell is ${POWERSHELL}: write each command in its syntax.`);
  });

  it('names no shell on an OS the adapters declare none for', async () => {
    const { assignee, verifier } = await judgedOn('darwin');
    for (const system of [assignee, verifier]) {
      expect(system).toContain('# Your shell');
      expect(system).not.toContain('Your shell is');
    }
  });
});
