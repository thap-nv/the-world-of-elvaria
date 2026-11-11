// Search for a tribe whose CLI has none (P1-53): the Steward hands `capabilities.search` of the character's tribe to
// toolPolicyOf and to the prompt, so an agy judge with Glob and Grep gets `git grep` and `git ls-files` in its tool
// policy (and thus in its settings and policy.json) and in its prompt, while a Claude knight, whose CLI searches on
// its own, gets neither. Only on a git plot: the bench's territories have none until the spec says so.
import { TerritorySchema } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { TerritoryId } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const searchless = (runner: AgentRunner): AgentRunner => ({
  ...runner,
  capabilities: { ...runner.capabilities, search: false },
});

/** A quest worked by kael (claude) and judged by orin (gemini, whose CLI has no search tool). */
async function judged(vcs: 'git' | 'none') {
  current = await bench({
    cast: [
      { id: 'kael', cls: 'knight' },
      { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
    ],
  });
  const read = await current.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: no territory dc1-se-team');
  await current.store.territories.write(
    TerritorySchema.parse({ ...read.value, vcs: { type: vcs, default_branch: 'main' } }),
  );
  const { claude, gemini } = current.runners;
  const runners = { claude, gemini: searchless(gemini) };
  running = current.steward({ runners });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Search words'));
  await tickUntil(running, current.clock, statusIs(current, 'Search words', 'done'));
  const requestOf = (role: string) => {
    const found = current?.requests.find((req) => req.role === role);
    if (found === undefined) throw new Error(`no ${role} request`);
    return found;
  };
  return { assignee: requestOf('assignee'), verifier: requestOf('verifier') };
}

describe('search for a tribe without a search tool (P1-53)', () => {
  it('gives the agy judge git grep and git ls-files, in its tool policy and its prompt, on a git plot', async () => {
    const { assignee, verifier } = await judged('git');
    expect(verifier.permissions.search_commands).toEqual(['git grep', 'git ls-files']);
    expect(verifier.prompt.system).toContain(
      '- `git grep`\n- `git ls-files`\n\nYour CLI has no tool to search',
    );
    expect(assignee.permissions.search_commands).toBeUndefined();
    expect(assignee.prompt.system).not.toContain('git grep');
  });

  it('gives none on a plot without git', async () => {
    const { verifier } = await judged('none');
    expect(verifier.permissions.search_commands).toBeUndefined();
    expect(verifier.prompt.system).not.toContain('git grep');
  });
});
