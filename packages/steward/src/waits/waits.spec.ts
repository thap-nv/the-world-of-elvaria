// The Steward writes the waits of ready work by their edges (LL-03): nothing under 2 minutes, `wait.started` once a
// wait lasted that long, `wait.ended` with the started line's id and the minutes once it is gone; a new Steward ends
// at its start the waits the last one left open that no longer hold. The wait here is `tribe_held`: the only knight's
// tribe is held by its CLI's version (tribe-versions.ts), which a spec holds and lets go at will.
import { ok } from '@elvaria/domain';
import type { Event, ToolFound, TribeId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const CLAUDE = 'C:/Users/owner/.local/bin/claude.exe';
const CHECKED = '2.1.322';
const T0 = '2026-11-07T09:00:00+07:00';
const TITLE = 'Fix the date filter';

/** What the claude CLI says: another version than its checked one holds the tribe. */
const says: { claude: ToolFound } = { claude: { path: CLAUDE, version: CHECKED } };
const hold = (): void => {
  says.claude = { path: CLAUDE, version: '2.1.330' };
};
const release = (): void => {
  says.claude = { path: CLAUDE, version: CHECKED };
};
const toolFound = (tribe: TribeId) => Promise.resolve(tribe === 'claude' ? says.claude : undefined);

function startSteward(kingdom: Bench): Steward {
  running = kingdom.steward({ toolFound });
  return running;
}

/** A kingdom whose only knight is of the claude tribe, its CLI held, and a quest for a knight. */
async function open() {
  current = await bench({ cast: [{ id: 'thorn', cls: 'knight', level: 5 }] });
  const tool = { path: CLAUDE, version: CHECKED, checked_version: CHECKED, auth: 'login' as const };
  await current.store.kingdom.update((kingdom) =>
    ok({ ...kingdom, tribes: kingdom.tribes.map((tribe) => ({ ...tribe, tool })) }),
  );
  hold();
  const steward = startSteward(current);
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload(TITLE));
  return { kingdom: current, steward };
}

const linesOf = async (kingdom: Bench, ...types: string[]): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter(({ type }) => types.includes(type));

/** Ticks `count` times, the clock a minute further before each tick but the first. */
async function ticks(kingdom: Bench, steward: Steward, count: number): Promise<void> {
  for (let tick = 0; tick < count; tick += 1) {
    if (tick > 0) kingdom.clock.advance(1);
    await steward.tick();
  }
}

/** Opens the kingdom and waits until the quest's `wait.started` line (the third tick, two minutes on). */
async function started() {
  const opened = await open();
  await ticks(opened.kingdom, opened.steward, 3);
  const [line] = await linesOf(opened.kingdom, 'wait.started');
  if (line === undefined) throw new Error('spec: no wait.started');
  return { ...opened, line };
}

describe('the waits of ready work', () => {
  it('writes nothing for a wait shorter than 2 minutes', async () => {
    const { kingdom, steward } = await open();
    await ticks(kingdom, steward, 2);
    release();
    kingdom.clock.advance(1);
    await steward.tick();
    expect((await kingdom.quest(TITLE)).assignee).toBe('thorn');
    expect(await linesOf(kingdom, 'wait.started', 'wait.ended')).toEqual([]);
  });

  it('starts a wait once it lasted 2 minutes, since it was first seen, and ends it with its id and minutes', async () => {
    const { kingdom, steward, line } = await started();
    const quest = await kingdom.quest(TITLE);
    expect(line).toMatchObject({
      type: 'wait.started',
      actor: { kind: 'steward' },
      quest: quest.id,
      territory: 'dc1-se-team',
      ts: '2026-11-07T09:02:00+07:00',
      data: { reason: 'tribe_held', since: T0, holder: { tribes: ['claude'] } },
    });
    await ticks(kingdom, steward, 3);
    expect(await linesOf(kingdom, 'wait.started', 'wait.ended')).toHaveLength(1);
    release();
    kingdom.clock.advance(1);
    await steward.tick();
    const [, ended] = await linesOf(kingdom, 'wait.started', 'wait.ended');
    expect(ended).toMatchObject({
      type: 'wait.ended',
      quest: quest.id,
      data: { started: line.id, reason: 'tribe_held', minutes: 5 },
    });
    // The plan and the notices are as they were: claimed once free, never told unclaimable.
    expect((await kingdom.quest(TITLE)).assignee).toBe('thorn');
    expect(await linesOf(kingdom, 'quest.unclaimable')).toEqual([]);
  });

  it('ends at the next start a wait left open that no longer holds', async () => {
    const { kingdom, steward, line } = await started();
    await steward.stop();
    kingdom.clock.advance(10);
    release();
    const again = startSteward(kingdom);
    await again.start({ loop: false });
    kingdom.clock.advance(1);
    await again.tick();
    const ends = await linesOf(kingdom, 'wait.ended');
    // Since 09:00, to the start at 09:12, not to the tick a minute later.
    expect(ends.map(({ data }) => data)).toEqual([{ started: line.id, reason: 'tribe_held', minutes: 12 }]);
    expect((await kingdom.quest(TITLE)).assignee).toBe('thorn');
  });

  it('keeps open across a restart a wait that still holds, and ends it later', async () => {
    const { kingdom, steward, line } = await started();
    await steward.stop();
    kingdom.clock.advance(10);
    const again = startSteward(kingdom);
    await again.start({ loop: false });
    await ticks(kingdom, again, 3);
    expect(await linesOf(kingdom, 'wait.started', 'wait.ended')).toEqual([line]);
    release();
    kingdom.clock.advance(1);
    await again.tick();
    const ends = await linesOf(kingdom, 'wait.ended');
    expect(ends.map(({ data }) => data)).toEqual([{ started: line.id, reason: 'tribe_held', minutes: 15 }]);
  });
});
