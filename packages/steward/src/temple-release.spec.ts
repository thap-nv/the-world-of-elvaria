// The Temple frees a character (PS-12g, temple-first plan DB13): kael, a claude knight, fails `tests_fail` three times in
// a row and the Steward suspends it; once a temple report puts in a line of that kind that its next session loads, the
// Steward releases it (`temple_done`) with its streak back at 0, and the report's bell names it. It stays suspended when
// the Monk only writes a letter (`rung: check`), when the operation is refused, when the line is for another tribe, and
// when the owner, not the streak, suspended it.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAILED, TEMPLE_CAST, linesOf, report, templeBench } from './__fixtures__/temple.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const STREAK = { fail_kind: 'tests_fail', count: 3 };
const CAST = TEMPLE_CAST.map((member) => (member.id === 'kael' ? { ...member, fail: STREAK } : member));
const SENTENCE = 'Run the tests of the touched package before you hand in.';

/** A Steward whose first tick suspends kael for its fail streak. */
async function suspendedByStreak() {
  current = await templeBench(CAST);
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await running.tick();
  expect(await current.character('kael')).toMatchObject({ status: 'suspended' });
  return { kingdom: current, steward: running };
}

const add = (fields: Record<string, unknown> = {}) => ({
  op: 'add',
  owner: 'temple',
  scope: { role: ['assignee'] },
  fail_kind: 'tests_fail',
  text: SENTENCE,
  source_verdict: FAILED,
  ...fields,
});

const releases = async (kingdom: Bench) =>
  (await linesOf(kingdom, 'character.release')).map(({ actor, data }) => [actor, data.character]);

describe('the Temple frees a character suspended for a fail streak (PS-12g)', () => {
  it('rebuilds suspensions on restart and releases without rereading the whole log', async () => {
    const { kingdom, steward } = await suspendedByStreak();
    await steward.stop();
    const events = openEventLog(kingdom.root);
    const read = vi.spyOn(events, 'read');
    running = kingdom.steward({ events });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    read.mockClear();
    await report(kingdom, { character: 'sage', operations: [add()], letters: [] });
    await running.tick();
    expect(await kingdom.character('kael')).toMatchObject({ status: 'idle', consecutive_fail: { count: 0 } });
    expect(await releases(kingdom)).toHaveLength(1);
    expect(read.mock.calls.filter(([cursor]) => cursor === undefined)).toEqual([]);
  });

  it('releases it as soon as a line of its fail kind in its scope is applied, its streak back at 0', async () => {
    const { kingdom, steward } = await suspendedByStreak();
    await report(kingdom, { character: 'sage', operations: [add()], letters: [] });
    await steward.tick();
    expect(await kingdom.character('kael')).toMatchObject({ status: 'idle', consecutive_fail: { count: 0 } });
    expect(await releases(kingdom)).toEqual([
      [{ kind: 'steward' }, expect.objectContaining({ id: 'kael', status: 'idle' })],
    ]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'temple')).toEqual([
      {
        kind: 'temple',
        character: 'sage',
        added: 1,
        retired: 0,
        refused: 0,
        letters: 0,
        released: ['kael'],
      },
    ]);
  });

  it.each([
    [
      'the Monk only writes a letter for a check',
      {
        operations: [],
        letters: [{ to: 'chancellor', rung: 'check', source_verdict: FAILED, body: SENTENCE, refs: [] }],
      },
    ],
    ['the operation is refused', { operations: [add({ source_verdict: undefined })], letters: [] }],
    ['the line is for another tribe', { operations: [add({ scope: { tribe: ['gemini'] } })], letters: [] }],
  ])('keeps it suspended when %s', async (_, payload) => {
    const { kingdom, steward } = await suspendedByStreak();
    await report(kingdom, { character: 'sage', ...payload });
    await steward.tick();
    expect(await kingdom.character('kael')).toMatchObject({ status: 'suspended', consecutive_fail: STREAK });
    expect(await releases(kingdom)).toEqual([]);
    const bells = kingdom.notices.filter(({ kind }) => kind === 'temple');
    // One bell: the report did something (a letter, a refusal, a line), only it freed nobody.
    expect(bells).toHaveLength(1);
    expect(bells.map((bell) => 'released' in bell)).toEqual([false]);
  });

  it('keeps a character the owner suspended, though its streak and the new line match', async () => {
    current = await templeBench(CAST);
    running = current.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('suspend', { character: 'kael', reason: 'trial over' });
    // The owner's command is applied before the tick's plan, which then finds kael suspended already.
    await running.tick();
    await report(current, { character: 'sage', operations: [add()], letters: [] });
    await running.tick();
    expect(await current.character('kael')).toMatchObject({ status: 'suspended', consecutive_fail: STREAK });
    const suspensions = await linesOf(current, 'character.suspend');
    expect(suspensions.map(({ actor }) => actor)).toEqual([{ kind: 'user' }]);
    expect(await releases(current)).toEqual([]);
  });
});
