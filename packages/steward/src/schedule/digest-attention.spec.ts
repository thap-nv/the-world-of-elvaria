// The Steward's digest and the attention queue of the files and the log (P2-04): with the same files and log, the
// digest lists what attentionOf lists, which `elvaria digest` and the herald list too; a quest no judge of the roster
// may take is among them, read from its `quest.judge_wait` line.
import { attentionOf } from '@elvaria/domain';
import type { Instant } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { statusIs } from '../__fixtures__/review.ts';
import { loadWorld } from '../tick/world.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Digest, DigestRequest, Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** The queue of the kingdom's files and log at `now`, as apps/cli and the herald build it. */
async function queueOf(kingdom: Bench, now: Instant) {
  const world = await loadWorld(kingdom.store, { warn: () => undefined });
  if (world === undefined) throw new Error('fixture: world');
  const [memos, verdicts, log] = await Promise.all([
    kingdom.store.memos.list(),
    kingdom.store.verdicts.list(),
    openEventLog(kingdom.root).read(),
  ]);
  return attentionOf(
    {
      kingdom: world.kingdom,
      territories: [...world.territories.values()],
      characters: [...world.characters.values()],
      quests: [...world.quests.values()],
      memos: memos.items,
      verdicts: verdicts.items,
      registry: world.registry,
      events: log.events,
    },
    now,
  );
}

describe("the Steward's digest and the queue of the files and the log", () => {
  it('lists the same items, a quest waiting for a judge among them', async () => {
    // thorn works on Sonnet and vesper judges on Sonnet too: nobody may judge thorn's quest.
    current = await bench({
      cast: [
        { id: 'thorn', cls: 'knight', level: 5 },
        { id: 'vesper', cls: 'judge', model: 'claude-sonnet-5-5' },
      ],
    });
    const kingdom = current;
    const asked: { readonly request: DigestRequest; readonly at: Instant }[] = [];
    const digest: Digest = {
      write: (request) => {
        asked.push({ request, at: kingdom.clock.now() });
        return Promise.resolve(`digest/${request.day}.md`);
      },
    };
    const settings = await kingdom.store.kingdom.read();
    if (!settings.ok) throw new Error('kingdom.json');
    const schedule = { ...settings.value.schedule, digest: { enabled: true, at: '09:30' } };
    await kingdom.store.kingdom.write({ ...settings.value, schedule });
    running = kingdom.steward({ digest });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await kingdom.command('create_quest', questPayload('Nobody judges'));
    await tickUntil(running, kingdom.clock, statusIs(kingdom, 'Nobody judges', 'review'));
    await tickUntil(running, kingdom.clock, () => Promise.resolve(asked.length === 1));
    const [written] = asked;
    if (written === undefined) throw new Error('no digest');
    const quest = await kingdom.quest('Nobody judges');
    expect(written.request.items).toContainEqual(
      expect.objectContaining({ kind: 'unjudgeable', quest: quest.id, class: 'judge' }),
    );
    expect(written.request.items).toEqual(await queueOf(kingdom, written.at));
  });
});
