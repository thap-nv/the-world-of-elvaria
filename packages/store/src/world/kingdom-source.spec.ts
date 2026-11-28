// The one reader of the attention queue's source (P2-01c): every list without its bad files, the registry or none,
// the whole log with the cursor to follow it from, and the sandbox's log when asked.
import { EVENT_VERSION, EventSchema, KingdomSchema, formatUlid } from '@elvaria/domain';
import type { Event, Instant } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, plantRegistry, tempKingdom } from '../__fixtures__/kingdom.ts';
import { openKingdom } from '../kingdom-store.ts';
import { readKingdomFiles, readKingdomSource } from './kingdom-source.ts';
import type { TempKingdom } from '../__fixtures__/kingdom.ts';

const KINGDOM = KingdomSchema.parse(fixture('kingdom'));
const AT = Date.parse('2026-11-28T08:00:00+07:00') as Instant;

const line = (n: number): Event =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: formatUlid(AT, BigInt(n)),
    ts: '2026-11-28T08:00:00+07:00',
    type: 'agent.tool',
    actor: { kind: 'character', id: 'thorn' },
    data: { tool: 'bash', command: `pnpm test ${n}`, exit: 0 },
  });

let kingdom: TempKingdom;

beforeEach(async () => {
  kingdom = await tempKingdom();
});

afterEach(async () => {
  await kingdom.remove();
});

describe('readKingdomSource', () => {
  it('reads the files, leaves a bad one out, and the whole log with where it ends', async () => {
    await plant(kingdom.root, 'territories/dc1-se-team/territory.json', fixture('territory'));
    await plant(kingdom.root, 'quests/q_20261106_7k3m2a.json', fixture('quest'));
    await plant(kingdom.root, 'campaigns/c_20261110_5m8q2r.json', fixture('campaign'));
    await plant(kingdom.root, 'quests/q_20261106_0bad00.json', '{ not json');
    await plantRegistry(kingdom.root);
    const store = openKingdom(kingdom.root);
    await openEventLog(store.root).append([line(1), line(2)]);

    const source = await readKingdomSource(store, KINGDOM);

    expect(source.kingdom).toBe(KINGDOM);
    expect(source.territories.map(({ id }) => id)).toEqual(['dc1-se-team']);
    expect(source.quests.map(({ id }) => id)).toEqual(['q_20261106_7k3m2a']);
    expect(source.campaigns.map(({ id }) => id)).toEqual(['c_20261110_5m8q2r']);
    expect(source.registry.classes.length).toBeGreaterThan(0);
    expect(source.events.map(({ id }) => id)).toEqual([line(1).id, line(2).id]);
    await openEventLog(store.root).append([line(3)]);
    const next = await openEventLog(store.root).read(source.cursor);
    expect(next.events.map(({ id }) => id)).toEqual([line(3).id]);
  });

  it('names no class when the registry does not load, and reads the sandbox log apart', async () => {
    const store = openKingdom(kingdom.root);
    await openEventLog(store.root, { sandbox: true }).append([line(4)]);

    const files = await readKingdomFiles(store);
    expect(files.registry).toEqual({ classes: [], kinds: [], rituals: [] });
    expect((await readKingdomSource(store, KINGDOM)).events).toEqual([]);
    expect((await readKingdomSource(store, KINGDOM, { sandbox: true })).events.map(({ id }) => id)).toEqual([
      line(4).id,
    ]);
  });
});
