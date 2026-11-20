// `confirm` naming its assignee (`elvaria quest confirm --to`): the Steward checks the character before it writes,
// and gives it the quest in the same apply, so the tick that follows cannot claim it for another (q_20261120_tpzvk5).
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from '../__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(options: BenchOptions = {}) {
  current = await bench(options);
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const TITLE = 'Drafted for someone';
// The work hangs, so the quest stays with whoever took it.
const plays = { work: { [TITLE]: ['hang'] } } as const;

const lines = async (kingdom: Bench) => (await openEventLog(kingdom.root).read()).events;
const answers = async (kingdom: Bench) =>
  (await lines(kingdom))
    .filter(({ type }) => type.startsWith('command.'))
    .map(({ type, data }) => [type, (data as { reason?: string }).reason]);
const questLines = async (kingdom: Bench) =>
  (await lines(kingdom)).filter(({ type }) => type.startsWith('quest.')).map(({ type }) => type);

/** A kingdom with one draft, answered: the commands that follow are the only ones the spec reads. */
async function withDraft(options: BenchOptions = {}) {
  const opened = await open({ plays, ...options });
  await opened.kingdom.command('create_quest', questPayload(TITLE, { draft: true }));
  await opened.steward.tick();
  const draft = await opened.kingdom.quest(TITLE);
  expect(draft.status).toBe('draft');
  return { ...opened, draft };
}

describe('confirm with an assignee', () => {
  it('without one, opens the draft for the Steward to give to whoever fits, as before', async () => {
    const { kingdom, steward, draft } = await withDraft();
    await kingdom.command('confirm', { quest: draft.id });
    await steward.tick();
    // Level 3 sits closest to a rank D quest: the Steward's own choice.
    expect(await kingdom.quest(TITLE)).toMatchObject({ status: 'working', assignee: 'kael' });
    expect((await kingdom.character('thorn')).status).toBe('idle');
  });

  it('opens the draft for that character, whom the same tick gives it to, not the one the Steward would pick', async () => {
    const { kingdom, steward, draft } = await withDraft();
    await kingdom.command('confirm', { quest: draft.id, assignee: 'thorn' });
    await steward.tick();
    expect(await kingdom.quest(TITLE)).toMatchObject({ status: 'working', assignee: 'thorn' });
    expect((await kingdom.character('kael')).status).toBe('idle');
    expect(await answers(kingdom)).toEqual([
      ['command.applied', undefined],
      ['command.applied', undefined],
    ]);
  });

  it('refuses a character who may not take it, and leaves the draft as it was', async () => {
    const cast = [
      { id: 'kael', cls: 'knight' },
      { id: 'wren', cls: 'scribe', tribe: 'gemini' },
      { id: 'rook', cls: 'knight', status: 'suspended' },
      // A tribe kingdom.json does not enable (here: does not list).
      { id: 'vex', cls: 'knight', tribe: 'codex' },
      { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
    ] as const;
    const { kingdom, steward, draft } = await withDraft({ cast });
    for (const assignee of ['nobody', 'wren', 'rook', 'vex'])
      await kingdom.command('confirm', { quest: draft.id, assignee });
    await steward.tick();
    expect(await answers(kingdom)).toEqual([
      ['command.applied', undefined],
      ['command.rejected', 'unknown_character'],
      ['command.rejected', 'class_mismatch'],
      ['command.rejected', 'character_suspended'],
      ['command.rejected', 'tribe_disabled'],
    ]);
    expect(await kingdom.quest(TITLE)).toEqual(draft);
    expect(await questLines(kingdom)).toEqual(['quest.drafted']);
    expect((await kingdom.character('kael')).status).toBe('idle');
  });
});
