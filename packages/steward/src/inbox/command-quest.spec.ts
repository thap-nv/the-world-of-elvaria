// LL-04: the line that answers a command names the quest the command names, applied or refused, and an edit's line
// names the fields it changed, so the log alone ties the owner's retry or edit to its quest (plans/learning-loop.md G5).
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

const linesOf = async (kingdom: Bench, prefix: string) =>
  (await openEventLog(kingdom.root).read()).events.filter(({ type }) => type.startsWith(prefix));

describe('the answer to a command that names a quest', () => {
  it('carries the quest, applied or refused, and an edit says which fields it changed', async () => {
    current = await bench({ cast: [] });
    running = current.steward();
    await running.start({ loop: false });
    const kingdom = current;
    await kingdom.command('create_quest', questPayload('Add the orders API'));
    await running.tick();
    const quest = await kingdom.quest('Add the orders API');
    await kingdom.command('edit_quest', {
      quest: quest.id,
      expected_updated_at: quest.updated_at,
      changes: { title: 'Orders API v2', description: 'Also the refunds.' },
    });
    await kingdom.command('edit_quest', {
      quest: quest.id,
      expected_updated_at: '2026-11-01T08:00:00+07:00',
      changes: { rank: 'S' },
    });
    await kingdom.command('set_rank', { quest: quest.id, rank: 'B' });
    await kingdom.command('cancel', { quest: 'q_20261107_zzzzzz' });
    await running.tick();
    const answers = (await linesOf(kingdom, 'command.')).map(({ type, quest: named, data }) => [
      type,
      (data as { kind?: string }).kind,
      named,
    ]);
    expect(answers).toEqual([
      // create_quest names no quest: its quest.created line does.
      ['command.applied', 'create_quest', undefined],
      ['command.applied', 'edit_quest', quest.id],
      ['command.rejected', 'edit_quest', quest.id],
      ['command.applied', 'set_rank', quest.id],
      // A quest the world does not hold is not named: its id may be a typo, and it has no journal to join.
      ['command.rejected', 'cancel', undefined],
    ]);
    const edits = (await linesOf(kingdom, 'quest.edited')).map(
      ({ data }) => (data as { fields?: unknown }).fields,
    );
    expect(edits).toEqual([['title', 'description'], ['rank']]);
  });
});
