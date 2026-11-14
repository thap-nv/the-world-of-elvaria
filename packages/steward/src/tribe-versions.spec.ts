// The Steward and a tribe whose CLI changed since its last passing check (A1b of the lessons of 2026-11-13): it asks
// each CLI before the plan (no mana), opens no session for a held tribe, rings once per hold and lists it in the digest.
// The two cases of 2026-11-14: agy updated itself in place (1.5.7 → 1.5.8), Codex's pinned file went with an update.
import { ok } from '@elvaria/domain';
import type { ToolFound, TribeId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from './__fixtures__/kingdom.ts';
import { VERSION_ASK_MS } from './tribe-versions.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Digest, DigestRequest, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const AGY = 'C:/Users/owner/.gemini/bin/agy.exe';
const CLAUDE = 'C:/Users/owner/.local/bin/claude.exe';

/** What each CLI says, as a spec changes it; every ask is counted. */
function cliBench(says: Record<string, ToolFound | undefined>) {
  const asked: string[] = [];
  const toolFound = (tribe: TribeId) => {
    asked.push(tribe);
    return Promise.resolve(says[tribe]);
  };
  return { asked, toolFound };
}

/** A kingdom whose tribes pinned agy 1.5.6 (never checked) and Claude Code 2.1.322 (checked on it). */
async function open(says: Record<string, ToolFound | undefined>, digest?: Digest, fails = false) {
  current = await bench({
    cast: [
      { id: 'thorn', cls: 'knight', level: 5 },
      { id: 'ember', cls: 'knight', tribe: 'gemini', model: 'gemini-4-argon-medium', level: 5 },
    ],
  });
  const pinOf = (id: string) =>
    id === 'gemini'
      ? { path: AGY, version: '1.5.6', auth: 'login' as const }
      : { path: CLAUDE, version: '2.1.322', checked_version: '2.1.322', auth: 'login' as const };
  await current.store.kingdom.update((kingdom) =>
    ok({ ...kingdom, tribes: kingdom.tribes.map((tribe) => ({ ...tribe, tool: pinOf(tribe.id) })) }),
  );
  const cli = cliBench(says);
  const toolFound = fails ? () => Promise.reject(new Error('spawn EPERM')) : cli.toolFound;
  running = current.steward({ toolFound, ...(digest === undefined ? {} : { digest }) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, cli };
}

const assignees = async (kingdom: Bench) => (await kingdom.quests()).map(({ assignee }) => assignee);

describe('a tribe held by its CLI', () => {
  it('gets no session while its CLI says another version, rings once, and works again once checked', async () => {
    const says = {
      gemini: { path: AGY, version: '1.5.8' },
      claude: { path: CLAUDE, version: '2.1.322' },
    };
    const { kingdom, steward, cli } = await open(says);
    await kingdom.command('create_quest', questPayload('Fix the date filter', { rank: 'D' }));
    await kingdom.store.characters.write({ ...(await kingdom.character('thorn')), status: 'suspended' });
    await steward.tick();
    await steward.tick();
    expect(await assignees(kingdom)).toEqual([null]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'tribe_held')).toEqual([
      { kind: 'tribe_held', tribe: 'gemini', path: AGY, version: '1.5.8', checked: '1.5.6' },
    ]);
    // Asked once a minute at most, each tribe.
    expect(cli.asked.toSorted()).toEqual(['claude', 'gemini']);
    // `tribe check gemini` with the real agy passed: it pinned 1.5.8 as checked.
    await kingdom.store.kingdom.update((value) =>
      ok({
        ...value,
        tribes: value.tribes.map((tribe) =>
          tribe.id === 'gemini'
            ? {
                ...tribe,
                tool: { path: AGY, version: '1.5.8', checked_version: '1.5.8', auth: 'login' as const },
              }
            : tribe,
        ),
      }),
    );
    await steward.tick();
    expect(await assignees(kingdom)).toEqual(['ember']);
  });

  it('holds a tribe whose CLI is gone, and asks again after a minute', async () => {
    const says: Record<string, ToolFound | undefined> = {
      gemini: { path: AGY, version: '1.5.6' },
      claude: { path: CLAUDE, version: undefined },
    };
    const { kingdom, steward, cli } = await open(says);
    await kingdom.command('create_quest', questPayload('Fix the date filter', { rank: 'D' }));
    await kingdom.store.characters.write({ ...(await kingdom.character('ember')), status: 'suspended' });
    await steward.tick();
    expect(await assignees(kingdom)).toEqual([null]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'tribe_held')).toEqual([
      { kind: 'tribe_held', tribe: 'claude', path: CLAUDE, version: undefined, checked: '2.1.322' },
    ]);
    says.claude = { path: CLAUDE, version: '2.1.322' };
    await steward.tick();
    expect(await assignees(kingdom)).toEqual([null]);
    kingdom.clock.advance(VERSION_ASK_MS / 60_000);
    await steward.tick();
    expect(await assignees(kingdom)).toEqual(['thorn']);
    expect(cli.asked.filter((tribe) => tribe === 'claude')).toHaveLength(2);
  });

  it('is an item of the digest, with the command that lifts the hold', async () => {
    const asked: DigestRequest[] = [];
    const port: Digest = {
      write: (request) => {
        asked.push(request);
        return Promise.resolve(`digest/${request.day}.md`);
      },
    };
    const says = { gemini: { path: AGY, version: '1.5.8' }, claude: { path: CLAUDE, version: '2.1.322' } };
    const { steward } = await open(says, port);
    await steward.tick();
    expect(asked[0]?.items.map(({ kind, command }) => [kind, command.join(' ')])).toEqual([
      ['tribe_held', 'tribe check gemini'],
    ]);
  });

  it.each([
    ['a CLI that does not answer', false],
    ['an ask that fails', true],
  ])('holds nothing for %s', async (_case, fails) => {
    const { kingdom, steward } = await open({}, undefined, fails);
    await kingdom.command('create_quest', questPayload('Fix the date filter', { rank: 'D' }));
    await steward.tick();
    expect(await assignees(kingdom)).not.toEqual([null]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'tribe_held')).toEqual([]);
  });
});
