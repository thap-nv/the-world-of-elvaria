// A submitted quest whose judge the roster does not have (P1-15): dispatch.verifier_same_family = different_model
// (the default) and the only judge works on the assignee's own model. (PS-11) A quest tagged visual, whose ritual asks
// for eyes, while no judge is of a tribe whose CLI reads images. (P2-04) The wait is a `quest.judge_wait` line: a new
// Steward reads it from the log and rings no bell again, and the digest lists it from there.
import { TribeIdSchema } from '@elvaria/domain';
import type { QuestId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, characterOf, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { statusIs } from '../__fixtures__/review.ts';
import { capturingPlots } from '../__fixtures__/screens.ts';
import { noticesOfWorld } from '../__fixtures__/notices.ts';
import { loadWorld } from '../tick/world.ts';
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

/** thorn (Sonnet) does the work; vesper judges on Sonnet too, so it may never judge thorn's quest. */
async function open() {
  current = await bench({
    cast: [
      { id: 'thorn', cls: 'knight', level: 5 },
      { id: 'vesper', cls: 'judge', model: 'claude-sonnet-5-5' },
    ],
  });
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const rung = (kingdom: Bench) => kingdom.notices.filter(({ kind }) => kind === 'unjudgeable');

/** What the `quest.judge_wait` lines of the log say about `quest`, in order. */
const waitLines = async (kingdom: Bench, quest: QuestId) =>
  (await openEventLog(kingdom.root).read()).events
    .filter((event) => event.type === 'quest.judge_wait' && event.quest === quest)
    .map(({ data }) => data);

describe('a submitted quest no judge of the roster may take', () => {
  it('rings once while it waits, also across a restart, then goes on with the judge the owner summons', async () => {
    const { kingdom, steward: first } = await open();
    await kingdom.command('create_quest', questPayload('Nobody judges'));
    await tickUntil(first, kingdom.clock, statusIs(kingdom, 'Nobody judges', 'review'));
    for (let tick = 0; tick < 3; tick += 1) await first.tick();
    const quest = await kingdom.quest('Nobody judges');
    expect(quest).toMatchObject({ status: 'review', verifier: null });
    expect(rung(kingdom)).toEqual([
      {
        kind: 'unjudgeable',
        quest: { id: quest.id, title: 'Nobody judges', rank: 'D' },
        classes: ['judge'],
        model: 'claude-sonnet-5-5',
      },
    ]);
    expect(await waitLines(kingdom, quest.id)).toEqual([{ reason: 'unjudgeable' }]);
    // A new Steward reads the wait from the log: no bell, no line.
    await first.stop();
    const steward = kingdom.steward();
    running = steward;
    expect(await steward.start({ loop: false })).toEqual({ ok: true });
    for (let tick = 0; tick < 3; tick += 1) await steward.tick();
    expect(rung(kingdom)).toHaveLength(1);
    expect(await waitLines(kingdom, quest.id)).toEqual([{ reason: 'unjudgeable' }]);
    // The owner summons a judge on another model: the review goes on, and the bell has nothing more to say.
    await kingdom.store.characters.write(
      characterOf({ id: 'sable', cls: 'judge', model: 'claude-opus-5-5' }),
    );
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Nobody judges', 'done'));
    expect(rung(kingdom)).toHaveLength(1);
    // The wait ended while the quest was still in review, before its judge's session: a line says so.
    expect(await waitLines(kingdom, quest.id)).toEqual([{ reason: 'unjudgeable' }, { reason: null }]);
  });
});

describe('a submitted quest that needs a judge who reads images (PS-11)', () => {
  it('rings and lists it as such while no judge sees, then goes on with a judge of a tribe that reads images', async () => {
    // sable may judge thorn's quests, but its tribe (claude) reads no image; the gemini runner declares vision.
    current = await bench({
      cast: [
        { id: 'thorn', cls: 'knight', level: 5 },
        { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
      ],
    });
    const kingdom = current;
    const { gemini } = kingdom.runners;
    const seeing = { ...gemini, capabilities: { ...gemini.capabilities, vision: true } };
    // Its territory's checks capture a screen, which the check `screens` asks of a quest judged by eye (PS-11b).
    running = kingdom.steward({
      runners: { ...kingdom.runners, [TribeIdSchema.parse('gemini')]: seeing },
      plots: capturingPlots(['button.png'])(kingdom.root),
    });
    const steward = running;
    expect(await steward.start({ loop: false })).toEqual({ ok: true });
    await kingdom.command('create_quest', questPayload('Paint the button', { tags: ['frontend', 'visual'] }));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Paint the button', 'review'));
    for (let tick = 0; tick < 3; tick += 1) await steward.tick();
    const quest = await kingdom.quest('Paint the button');
    expect(quest).toMatchObject({ status: 'review', verifier: null });
    expect(rung(kingdom)).toEqual([
      {
        kind: 'unjudgeable',
        quest: { id: quest.id, title: 'Paint the button', rank: 'D' },
        classes: ['judge'],
        model: 'claude-sonnet-5-5',
        vision: true,
      },
    ]);
    const world = await loadWorld(kingdom.store, { warn: () => undefined });
    if (world === undefined) throw new Error('fixture: world');
    const { events } = await openEventLog(kingdom.root).read();
    expect(noticesOfWorld(world, events).unjudgeable).toEqual([
      { quest: quest.id, class: 'judge', vision: true },
    ]);
    // The owner summons a judge of the tribe that reads images: the review goes on with it.
    await kingdom.store.characters.write(
      characterOf({ id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-4-argon-medium' }),
    );
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Paint the button', 'done'));
    expect((await kingdom.quest('Paint the button')).attempt_log).toContainEqual(
      expect.objectContaining({ character: 'orin', role: 'verifier' }),
    );
    expect(rung(kingdom)).toHaveLength(1);
  });
});
