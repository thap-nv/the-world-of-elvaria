// A healer's session in the Steward (ADR 0034, plans/healer.md 4.4, HL-05), on real git repos and PlotManager: the
// territory's hooks refuse the doer's submit commit once (the plots' commit fails as a hook would), planTick picks
// the healer, whose session opens in the quest's plot on the doer's staged tree with heal.md, in the run's `heal/`
// folder. The Steward measures what the healer changed: a small mend within the work is kept as heal.patch, committed
// through the hooks and shown to the judge; a file outside the work puts the plot back on the doer's tree and sends
// the quest to the infirmary; a healer whose mana runs out leaves the plot as the doer left it.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import { isEventOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { fromPortable } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { leavingRunners } from '../__fixtures__/deliver.ts';
import { git, gitPlots, gitRepoWith, onRepo } from '../__fixtures__/git-plots.ts';
import { CAST, bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { statusIs } from '../__fixtures__/review.ts';
import type { Leaves } from '../__fixtures__/deliver.ts';
import type { Bench, Plays } from '../__fixtures__/kingdom.ts';
import type { Plots, Steward } from '../types.ts';
import type { TempDir } from '@elvaria/testkit';
import type { Quest } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: TempDir[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((folder) => folder.remove()));
  running = undefined;
  current = undefined;
});

const TITLE = 'Linted';
const BEFORE = 'export const a = 1;\n';
const DOER = 'export const a = 1;\nexport const b = 2;\nlet unused;\n';
const MENDED = 'export const a = 1;\nexport const b = 2;\n';
const HOOK_SAID = 'husky - pre-commit script failed (code 1)\nsrc/app.ts\n  3:5  error  no-unused-vars';
/** A healer of the doer's family (luật 2 of plans/healer.md 4.3): thorn and kael are Claude too. */
const CAST_WITH_HEALER = [...CAST, { id: 'mira', cls: 'healer', model: 'claude-sonnet-5-5', level: 4 }];

/** The plots of a git repo whose hooks refuse the first submit commit, as a lint error would. */
function refusingOnce(root: string): Plots {
  const plots = gitPlots(root);
  let commits = 0;
  return {
    ...plots,
    commit: (plot, message, rescue) => {
      commits += 1;
      return commits === 1 ? Promise.reject(new Error(HOOK_SAID)) : plots.commit(plot, message, rescue);
    },
  };
}

/** The doer leaves its work; the healer `mends`, each in its plot before its session plays. */
const leaving =
  (mends: Readonly<Record<string, string>>): Leaves =>
  (req) =>
    req.character.id === 'mira' ? mends : { 'src/app.ts': DOER };

async function open(mends: Readonly<Record<string, string>>, plays: Plays = {}) {
  const folder = await tempDir('heal repo');
  folders.push(folder);
  await gitRepoWith(folder.root, { 'src/app.ts': BEFORE, 'src/other.ts': BEFORE });
  current = await bench({ cast: CAST_WITH_HEALER, plays });
  await onRepo(current, folder.root, []);
  running = current.steward({
    plots: refusingOnce(current.root),
    runners: leavingRunners(current, leaving(mends)),
  });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload(TITLE));
  return { kingdom: current, steward: running };
}

const healerRequest = (kingdom: Bench) => kingdom.requests.find(({ character }) => character.id === 'mira');
const worktreeOf = (quest: Quest): string => fromPortable(quest.plot.path ?? '');
const linesOf = async (kingdom: Bench, quest: Quest) =>
  (await openJournal(kingdom.root, quest.id).read()).events;

describe("a healer's session on the doer's refused work", () => {
  it('mends one line, commits it through the hooks with heal.patch, and the judge reads the change', async () => {
    const { kingdom, steward } = await open({ 'src/app.ts': MENDED });
    await tickUntil(steward, kingdom.clock, () =>
      Promise.resolve(kingdom.requests.some(({ role }) => role === 'verifier')),
    );
    const quest = await kingdom.quest(TITLE);
    expect(quest.assignee).not.toBe('mira');
    expect(quest.attempts).toBe(1);
    const run = `.runs/${quest.id}-1`;
    // The healer's request: its own folder and kingdom.heal's minutes at hard_pct, heal.md with the staged files.
    const healer = healerRequest(kingdom);
    expect(healer?.run_dir).toBe(path.join(kingdom.root, run, 'heal'));
    expect(healer?.budget.max_minutes).toBe(22.5);
    expect(healer?.prompt.user).toContain('# The work you mend');
    expect(healer?.prompt.user).toContain('- `src/app.ts`');
    expect(healer?.prompt.user).toContain(HOOK_SAID.split('\n')[2]);
    const lines = await linesOf(kingdom, quest);
    expect(lines.find((line) => isEventOf(line, 'quest.healing'))?.data).toMatchObject({ healer: 'mira' });
    const submitted = lines.findLast((line) => isEventOf(line, 'quest.submitted'));
    expect(submitted?.data).toMatchObject({
      heal: { by: 'mira', files: 1, lines: 1, patch: `${run}/heal/heal.patch` },
    });
    expect(await readFile(path.join(kingdom.root, run, 'heal', 'heal.patch'), 'utf8')).toContain(
      '-let unused;',
    );
    expect(git(worktreeOf(quest), 'show', 'HEAD:src/app.ts')).toBe(MENDED.trimEnd());
    const judge = kingdom.requests.find(({ role }) => role === 'verifier');
    expect(judge?.prompt.user).toContain("# The healer's change");
    expect(judge?.prompt.user).toContain('mira, a healer, mended it');
    expect(await kingdom.character('mira')).toMatchObject({ status: 'idle', current: null });
  });

  it('puts the plot back on the doer’s work and rings the infirmary for a file outside it', async () => {
    const { kingdom, steward } = await open({
      'src/app.ts': MENDED,
      'src/other.ts': 'export const c = 3;\n',
    });
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, TITLE, 'infirmary'));
    const quest = await kingdom.quest(TITLE);
    const worktree = worktreeOf(quest);
    expect(await readFile(path.join(worktree, 'src', 'app.ts'), 'utf8')).toBe(DOER);
    expect(await readFile(path.join(worktree, 'src', 'other.ts'), 'utf8')).toBe(BEFORE);
    expect(git(worktree, 'rev-list', '--count', `main..quest/${quest.id}`)).toBe('0');
    expect(kingdom.notices).toEqual([
      expect.objectContaining({
        kind: 'infirmary',
        trip: 'commit',
        reason: { code: 'heal:out_of_work', params: { count: 1 } },
        detail: { paths: ['src/other.ts'] },
      }),
    ]);
    expect(await kingdom.character('mira')).toMatchObject({ status: 'idle', current: null });
  });

  it('refuses more lines than kingdom.heal.max_lines, the plot back on the doer’s tree', async () => {
    const long = `${MENDED}${Array.from({ length: 60 }, (_, at) => `export const x${String(at)} = ${String(at)};`).join('\n')}\n`;
    const { kingdom, steward } = await open({ 'src/app.ts': long });
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, TITLE, 'infirmary'));
    const quest = await kingdom.quest(TITLE);
    expect(await readFile(path.join(worktreeOf(quest), 'src', 'app.ts'), 'utf8')).toBe(DOER);
    expect(kingdom.notices).toEqual([
      expect.objectContaining({ reason: { code: 'heal:over_limit', params: { files: 1, lines: 61 } } }),
    ]);
  });

  it('leaves the plot as the doer left it when the healer’s mana runs out, and the heal does not count', async () => {
    const { kingdom, steward } = await open(
      { 'src/app.ts': 'half-mended\n' },
      { work: { [TITLE]: ['submit', 'rate_limit'] } },
    );
    const healerEnded = async () =>
      (await kingdom.quest(TITLE)).attempt_log.some(
        ({ character, ended_at: ended }) => character === 'mira' && ended !== undefined,
      );
    await tickUntil(steward, kingdom.clock, healerEnded);
    const quest = await kingdom.quest(TITLE);
    expect(quest.status).toBe('returned');
    expect(quest.attempt_log.at(-1)).toMatchObject({
      character: 'mira',
      heal: 'session',
      outcome: 'paused',
    });
    expect(await readFile(path.join(worktreeOf(quest), 'src', 'app.ts'), 'utf8')).toBe(DOER);
    expect(await kingdom.character('mira')).toMatchObject({ status: 'sleeping_mana', current: null });
    expect(kingdom.notices.filter(({ kind }) => kind === 'infirmary')).toEqual([]);
  });
});
