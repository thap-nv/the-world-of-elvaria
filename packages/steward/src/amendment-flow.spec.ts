// Gaps 16 and 20 of the PS-07 report (fix/amendment-flow, ADR 0024). A doer that stops because the fix it needs lies
// outside its scope leaves work the territory's hook refuses: its amendment is filed all the same, the quest waits on
// its author with the work in the plot (uncommitted, no infirmary), and the next session goes on from there. Without
// an amendment a refused commit or patch is the breaker it was, its letter's memos filed now. An accepted amendment
// opens the quest's scope to the memo's refs, so the submit counts out of scope only what nobody approved, and the
// metrics read the same.
import { metricsOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import type { Event, TerritoryId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { authorJob } from './__fixtures__/author.ts';
import { FAIL, PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { letter, writing } from './__fixtures__/letters.ts';
import { plotsWith, statusIs } from './__fixtures__/review.ts';
import type { Decide } from './__fixtures__/author.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Letters } from './__fixtures__/letters.ts';
import type { Plots, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

interface Setup {
  readonly letters: Letters;
  readonly decide?: Decide;
  readonly plots?: (kingdom: Bench) => Partial<Plots>;
  /** laws.patch_paths of dc1-se-team, when its assignees may leave a patch. */
  readonly patchPaths?: readonly string[];
  readonly verdicts?: Readonly<Record<string, readonly unknown[]>>;
}

async function open({ letters, decide = () => ({}), plots = () => ({}), patchPaths, verdicts = {} }: Setup) {
  current = await bench({ plays: { verdicts } });
  const made = current;
  if (patchPaths !== undefined) {
    const read = await made.store.territories.read('dc1-se-team' as TerritoryId);
    if (!read.ok) throw new Error('fixture: no territory');
    const laws = { ...read.value.laws, patch_paths: [...patchPaths] };
    await made.store.territories.write({ ...read.value, laws });
  }
  const runners = {
    claude: writing(made.runners.claude, letters, () => undefined),
    gemini: writing(made.runners.gemini, letters, () => undefined),
  };
  const calls: string[] = [];
  const job = authorJob(() => made, decide);
  running = made.steward({ runners, onCall: [job], plots: plotsWith(made.root, plots(made), calls) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: made, steward: running, calls };
}

const AMENDMENT =
  '- amendment: Đề bài: chỉ sửa src/. Đề nghị: tách breakers.spec.ts (309 dòng, lint đỏ). refs: package.json, ./src/a.ts';
const PROPOSAL = '- proposal: Thêm một luật lint cho độ dài file spec. refs: package.json';
const HOOK = 'max-lines: breakers.spec.ts has 309 lines (300 allowed)';
const CHANCELLOR = { created_by: 'chancellor', scope_paths: ['src/**'] };
/** What the plot changed: one file in the scope, the one the amendment opens, and one nobody approved. */
const TOUCHED = ['src/a.ts', 'package.json', 'README.md'];

/** An acceptance that keeps the description: only the scope changes. */
const accept: Decide = () => ({ decision: 'accepted', note: 'Đúng: tách file spec là việc của quest này.' });
const linesOf = async (kingdom: Bench, type: string): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);
const blockedOn = (kingdom: Bench, title: string) => async () =>
  (await kingdom.quest(title)).blocked?.amendment !== undefined;
const infirmaries = (kingdom: Bench) => kingdom.notices.filter(({ kind }) => kind === 'infirmary');

/** A commit the hook refuses for each run of `title` in `refusing` (1-based), as commitPlot sees a hook's exit. */
function refusingCommits(kingdom: Bench, title: string, refusing: readonly number[]): Partial<Plots> {
  let submits = 0;
  const base = plotsWith(kingdom.root, {});
  return {
    commit: async (plot, message, rescue) => {
      if (message.includes('submit')) {
        const quest = await kingdom.quest(title);
        submits += quest.plot.branch === plot.branch ? 1 : 0;
        if (quest.plot.branch === plot.branch && refusing.includes(submits)) throw new Error(HOOK);
      }
      return base.commit(plot, message, rescue);
    },
    touched: () => Promise.resolve(TOUCHED),
  };
}

describe('a submit the Steward could not commit, its letter holding an amendment', () => {
  it('waits on the author with the work in the plot, then goes on in the opened scope', async () => {
    const { kingdom, steward, calls } = await open({
      letters: (title, nth) => letter(title === 'Opened' && nth === 1 ? AMENDMENT : '-'),
      decide: accept,
      plots: (k) => refusingCommits(k, 'Opened', [1]),
      verdicts: { Opened: [PASS] },
    });
    await kingdom.command('create_quest', questPayload('Opened', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, blockedOn(kingdom, 'Opened'));
    const waiting = await kingdom.quest('Opened');
    expect(waiting).toMatchObject({ status: 'blocked', blocked: { amendment: { by: 'author' } } });
    // No infirmary, no WIP commit after the refused submit: the work waits in the plot as the doer left it.
    expect(infirmaries(kingdom)).toEqual([]);
    expect(calls.filter((call) => call.startsWith('commit'))).toEqual([`commit chore: submit ${waiting.id}`]);
    expect(kingdom.warnings.join('\n')).toContain(`stays uncommitted in the plot while the quest waits`);
    expect(kingdom.warnings.join('\n')).toContain(HOOK);
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Opened', 'done'));
    const done = await kingdom.quest('Opened');
    // The memo's refs outside the scope join it, once each and as a scope entry; the edit is the author's.
    expect(done.scope_paths).toEqual(['src/**', 'package.json']);
    const edits = (await linesOf(kingdom, 'quest.edited')).filter(({ actor }) => actor.kind === 'chancellor');
    expect(edits.length).toBeGreaterThan(0);
    // The submit counts out of scope only the file nobody approved, and so do the metrics.
    const [submitted] = await linesOf(kingdom, 'quest.submitted');
    expect(submitted?.data).toMatchObject({ out_of_scope: ['README.md'] });
    const metrics = metricsOf({
      quests: (await kingdom.store.quests.list()).items,
      verdicts: (await kingdom.store.verdicts.list()).items,
      events: (await openEventLog(kingdom.root).read()).events,
      commands: [],
    });
    expect(metrics.out_of_scope.map(({ paths }) => paths)).toEqual([['README.md']]);
  });

  it('waits likewise on a refused patch, with no commit tried', async () => {
    const { kingdom, steward, calls } = await open({
      letters: (title, nth) => letter(title === 'Patched' && nth === 1 ? AMENDMENT : '-'),
      plots: () => ({
        applyPatch: () => Promise.resolve({ status: 'refused', detail: 'it does not apply' }),
      }),
      patchPaths: ['.husky/**'],
    });
    await kingdom.command('create_quest', questPayload('Patched', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, blockedOn(kingdom, 'Patched'));
    expect(await kingdom.quest('Patched')).toMatchObject({ status: 'blocked' });
    expect(infirmaries(kingdom)).toEqual([]);
    expect(calls.filter((call) => call.startsWith('commit'))).toEqual([]);
    expect(kingdom.warnings.join('\n')).toContain('its patch was refused: it does not apply');
  });
});

describe('a submit the Steward could not commit, its letter holding no amendment', () => {
  it('goes to the infirmary as before, the letter’s memos filed', async () => {
    const { kingdom, steward } = await open({
      letters: () => letter(PROPOSAL),
      plots: (k) => refusingCommits(k, 'Refused', [1, 2, 3]),
    });
    await kingdom.command('create_quest', questPayload('Refused', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Refused', 'infirmary'));
    expect(infirmaries(kingdom).at(-1)).toMatchObject({ reason: { code: 'breaker:commit' } });
    const memos = (await kingdom.store.memos.list()).items;
    expect(memos.map(({ kind, to }) => [kind, to.route])).toEqual([['proposal', 'chancellor']]);
    expect((await kingdom.quest('Refused')).blocked).toBeUndefined();
  });

  it('keeps the objection its letter filed on the quest, for the review after the infirmary', async () => {
    const objection = '- objection: Ghi chú sai: orders.spec.ts đã xanh. refs: src/api/orders.spec.ts';
    const { kingdom, steward } = await open({
      letters: (_, nth) => letter(nth === 2 ? objection : '-'),
      plots: (k) => refusingCommits(k, 'Objected', [2]),
      verdicts: { Objected: [FAIL] },
    });
    await kingdom.command('create_quest', questPayload('Objected', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Objected', 'infirmary'));
    const [memo] = (await kingdom.store.memos.list()).items;
    expect(memo).toMatchObject({ kind: 'objection', to: { route: 'judge' } });
    expect((await kingdom.quest('Objected')).objection?.memo).toBe(memo?.id);
  });
});

describe('an accepted amendment', () => {
  it('opens the scope even when the description the author read changed since, which it keeps', async () => {
    const stale: Decide = () => ({
      decision: 'accepted',
      note: 'Đúng.',
      description: '## Goal\n\nMô tả mới.',
      expected_updated_at: '2026-01-01T00:00:00+07:00',
    });
    const { kingdom, steward } = await open({
      letters: (title, nth) => letter(title === 'Stale' && nth === 1 ? AMENDMENT : '-'),
      decide: stale,
      plots: () => ({ touched: () => Promise.resolve(TOUCHED) }),
      verdicts: { Stale: [PASS] },
    });
    await kingdom.command('create_quest', questPayload('Stale', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Stale', 'done'));
    const quest = await kingdom.quest('Stale');
    expect(quest.scope_paths).toEqual(['src/**', 'package.json']);
    expect(quest.description).toBe(questPayload('Stale').description);
    expect(kingdom.warnings.join('\n')).toContain('leaves its description as it is');
  });

  it('leaves a quest with no scope unbounded', async () => {
    const { kingdom, steward } = await open({
      letters: (title, nth) => letter(title === 'Unbounded' && nth === 1 ? AMENDMENT : '-'),
      decide: accept,
      verdicts: { Unbounded: [PASS] },
    });
    await kingdom.command('create_quest', questPayload('Unbounded', { created_by: 'chancellor' }));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Unbounded', 'done'));
    expect((await kingdom.quest('Unbounded')).scope_paths).toBeUndefined();
    expect(kingdom.warnings.join('\n')).not.toContain('leaves its');
  });
});
