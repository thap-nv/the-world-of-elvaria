// The probe after a red patrol (CM-04, CM-06) on a real git repo whose path has spaces, with real checks: a bench whose
// code territory is that repo, one check and a patrol, probes on; the owner's patrol; commits and merges on main, each
// merge with its `delivery.merged` line; the probe's `check.attributed` lines.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EventSchema } from '@elvaria/domain';
import type { QuestId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import type { EventLog } from '@elvaria/eventlog';

import { git, gitPlots, gitRepoWith, onRepo } from './git-plots.ts';
import { bench } from './kingdom.ts';
import type { Bench } from './kingdom.ts';
import type { Steward } from '../types.ts';

// The plot is <repo>/.elvaria/worktrees/<name>: four levels up is the kingdom, where the one-time flake waits.
const CHECK = [
  "import { existsSync, readFileSync, rmSync } from 'node:fs';",
  "const flake = '../../../../flake';",
  "if (existsSync(flake)) { rmSync(flake); console.error('Error: flaked'); process.exit(1); }",
  "if (readFileSync('state.txt', 'utf8').trim() === 'red') { console.error('Error: red'); process.exit(1); }",
  "if (existsSync('x.txt') && existsSync('y.txt')) { console.error('Error: x and y'); process.exit(1); }",
  "console.log('green');",
].join('\n');
export const CODE = 'dc1-se-team';
export const TS = '2026-11-07T09:00:00+07:00';
export const [Q1, Q2, Q3] = ['aaaaa1', 'aaaaa2', 'aaaaa3'].map((tail) => `q_20261107_${tail}` as QuestId) as [
  QuestId,
  QuestId,
  QuestId,
];

/** CM-06: a knight who did the archived quests, the judge who passed them. */
export const PROBE_CAST = [
  { id: 'thorn', cls: 'knight', level: 5 },
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
];

/** A bench whose code territory is a git repo with one check and a patrol, probes on; main green at `green`. */
export async function openProbe(
  state = 'green',
  cast: typeof PROBE_CAST = [],
  events?: (log: EventLog) => EventLog,
) {
  const kingdom = await bench({ cast });
  const repo = await gitRepoWith(path.join(kingdom.root, 'the repo'), {
    'check.mjs': CHECK,
    'state.txt': `${state}\n`,
  });
  const checks = [{ id: 'unit', run: 'node check.mjs', when: ['**'], timeout_minutes: 5 }];
  await onRepo(kingdom, repo, [], { checks, patrol: { scans: [] } });
  const log = openEventLog(kingdom.root);
  const steward = kingdom.steward({
    plots: gitPlots(kingdom.root, { probe: true }),
    ...(events === undefined ? {} : { events: events(log) }),
  });
  const started = await steward.start({ loop: false });
  if (!started.ok) throw new Error('fixture: the Steward did not start');
  return { kingdom, repo, steward, green: git(repo, 'rev-parse', 'HEAD') };
}

/** The owner's `territory patrol --now`, its probe included, run to its end. */
export async function patrolNow(kingdom: Bench, steward: Steward): Promise<void> {
  await kingdom.command('patrol', { territory: CODE });
  await steward.tick();
  await steward.idle();
}

export const commitOn = async (repo: string, files: Readonly<Record<string, string>>, message: string) => {
  for (const [file, text] of Object.entries(files)) await writeFile(path.join(repo, file), text);
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
};

let serial = 0;
/**
 * `quest`'s branch from `from` with `files`, the base branch merged in first when `update` (the merge queue's update),
 * merged into main as the Steward does it, and its `delivery.merged`; its own commit and the merge's.
 */
export async function deliver(
  kingdom: Bench,
  repo: string,
  quest: QuestId,
  from: string,
  files: Record<string, string>,
  update = false,
) {
  git(repo, 'switch', '-q', '-c', `quest/${quest}`, from);
  const own = await commitOn(repo, files, quest);
  if (update) git(repo, 'merge', '-q', '--no-ff', '-m', 'update', 'main');
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', 'main');
  git(repo, 'merge', '-q', '--no-ff', '-m', `merge ${quest}`, `quest/${quest}`);
  const merge = git(repo, 'rev-parse', 'HEAD');
  serial += 1;
  const pr = { number: serial, url: `https://github.com/o/r/pull/${serial}` };
  const data = {
    quest,
    territory: CODE,
    branch: `quest/${quest}`,
    head,
    pr,
    merge_sha: merge,
    method: 'merge',
  };
  const line = { v: 2, id: `01JG${String(serial).padStart(22, '0')}`, ts: TS, type: 'delivery.merged' };
  const event = { ...line, actor: { kind: 'steward' }, quest, territory: CODE };
  await openEventLog(kingdom.root).append([
    EventSchema.parse({ ...event, data: { ...data, sealed: true, branch_deleted: true } }),
  ]);
  return { own, merge };
}

/** The probe's lines: the cause, the step, the culprit, and each run's commit and whether it passed. */
export async function attributions(kingdom: Bench) {
  return (await openEventLog(kingdom.root).read()).events.flatMap((event) =>
    event.type === 'check.attributed' ? [event.data] : [],
  );
}
