// P1-03 "xong khi": ten fake quests go all the way round with FakeRunner on a temp kingdom, and a Steward stopped
// in the middle is replaced by a new one that loses no quest and never runs one twice (implementation-plan §3.1).
import { reduce } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { FAIL, bench, questPayload, tickUntil, worldOfFiles } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Quest } from '@elvaria/domain';

let current: Bench | undefined;
afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const DOCS = { kind: 'document', territory: 'handbook', class_required: 'scribe', tags: ['docs'] };

const PLAYS = {
  work: {
    'Crashes once': ['crash', 'submit'],
    'Asks a question': ['ask', 'submit'],
    'Hangs until the restart': ['hang', 'submit'],
  },
  verdicts: { 'Fails review once': [FAIL] },
} as const;

/** The owner at the throne: answers a question and seals what waits for the seal, once each. */
function owner(kingdom: Bench) {
  const acted = new Set<string>();
  return async (quests: readonly Quest[]): Promise<void> => {
    for (const quest of quests) {
      if (acted.has(`${quest.id}:${quest.status}`)) continue;
      if (quest.status === 'blocked')
        await kingdom.command('answer', { quest: quest.id, answer: 'On main.' });
      else if (quest.status === 'awaiting_seal') await kingdom.command('seal', { quest: quest.id });
      else continue;
      acted.add(`${quest.id}:${quest.status}`);
    }
  };
}

const sessionsOf = (kingdom: Bench, quest: Quest) =>
  [...kingdom.fakes.claude.requests, ...kingdom.fakes.gemini.requests].filter(
    (req) => req.quest?.id === quest.id,
  );

describe('the Steward over a day of ten quests, stopped and started again in the middle', () => {
  it('takes every quest to done, loses none and never runs one twice', async () => {
    const kingdom = await bench({ plays: PLAYS });
    current = kingdom;
    for (const title of [
      'Add the orders API',
      'Add the users API',
      'Crashes once',
      'Fails review once',
      'Asks a question',
      'Hangs until the restart',
    ])
      await kingdom.command('create_quest', questPayload(title));
    await kingdom.command('create_quest', questPayload('Needs the seal', { seal_required: true }));
    await kingdom.command('create_quest', questPayload('Write the setup guide', DOCS));
    await kingdom.command('create_quest', questPayload('Write the FAQ', DOCS));
    const act = owner(kingdom);

    const first = kingdom.steward();
    expect(await first.start({ loop: false })).toEqual({ ok: true });
    await first.tick();
    const orders = await kingdom.quest('Add the orders API');
    await kingdom.command(
      'create_quest',
      questPayload('Depends on the orders API', { depends_on: [orders.id] }),
    );
    await tickUntil(first, kingdom.clock, async () => {
      const quests = await kingdom.quests();
      await act(quests);
      const hung = quests.find(({ title }) => title === 'Hangs until the restart');
      return hung?.status === 'working' && quests.filter(({ status }) => status === 'done').length >= 3;
    });
    // The Steward stops in the middle of the day: the hung session dies with it.
    await first.stop();

    const second = kingdom.steward();
    expect(await second.start({ loop: false })).toEqual({ ok: true });
    await tickUntil(second, kingdom.clock, async () => {
      const quests = await kingdom.quests();
      await act(quests);
      return quests.length === 10 && quests.every(({ status }) => status === 'done');
    });
    await second.stop();

    const quests = await kingdom.quests();
    for (const quest of quests) {
      // One entry of attempt_log per session ever spawned for the quest, and none left open.
      expect(sessionsOf(kingdom, quest)).toHaveLength(quest.attempt_log.length);
      expect(quest.attempt_log.every(({ ended_at }) => ended_at !== undefined)).toBe(true);
    }
    const byTitle = (title: string) => quests.find((quest) => quest.title === title)!;
    // The hung session went with the first Steward: its run says nothing and costs no attempt (P1-44).
    const hung = byTitle('Hangs until the restart');
    expect(hung.attempt_log.map(({ outcome }) => outcome)).toEqual(['cancelled', 'submitted', 'submitted']);
    expect(hung.attempts).toBe(1);
    // A session the stop cut short gives its attempt back too, so these counts are at least, not exactly.
    expect(byTitle('Crashes once').attempt_log[0]).toMatchObject({ role: 'assignee', outcome: 'crash' });
    expect(byTitle('Crashes once').attempts).toBeGreaterThanOrEqual(2);
    expect(byTitle('Fails review once').attempts).toBeGreaterThanOrEqual(2);
    expect(byTitle('Needs the seal').seal).toBeDefined();
    expect(byTitle('Asks a question').blocked).toMatchObject({ answer: 'On main.' });
    // The fresh session after the failed review reads the verifier's notes (§10 question 4).
    const retried = sessionsOf(kingdom, byTitle('Fails review once')).filter(
      ({ role }) => role === 'assignee',
    );
    expect(retried.at(-1)?.prompt.user).toContain(FAIL.notes);
    // The scribe's work is judged by the other tribe's judge, never by a scribe or a knight.
    expect(new Set(quests.filter(({ kind }) => kind === 'document').map(({ verifier }) => verifier))).toEqual(
      new Set(['sable']),
    );
    const log = await openEventLog(kingdom.root).read();
    expect(log.issues).toEqual([]);
    expect(reduce(await kingdom.morning(), log.events)).toEqual(await worldOfFiles(kingdom.store));
    expect(kingdom.warnings.filter((line) => !line.includes('was lost'))).toEqual([]);
    expect(kingdom.notices.map(({ kind }) => kind).sort()).toEqual(['awaiting_seal', 'question']);
  });
});
