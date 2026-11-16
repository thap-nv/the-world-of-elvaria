// What the delivery specs share (PS-08c): dc1-se-team on a real git repo whose `origin` is a bare repo in another
// temp folder, its vcs.remote a GitHub URL for the fake forge to read, git plots, assignees that leave files, this
// process's env (git and the territory's hooks need its PATH; no GIT_* in it) and the fake forge.
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import type { Event } from '@elvaria/domain';

import { leavingRunners } from './deliver.ts';
import { fakeForge } from './forge.ts';
import { childEnv, git, gitPlots, gitRepoWith, onRepo } from './git-plots.ts';
import { RM_TEMP, bench } from './kingdom.ts';
import type { Forges } from '../forge/forge.ts';
import type { Steward, StewardDeps } from '../types.ts';
import type { Leaves } from './deliver.ts';
import type { FakeForge } from './forge.ts';
import type { Bench } from './kingdom.ts';

export const FORGE_REMOTE = 'https://github.com/elvaria-specs/kingdom-repo.git';

export interface ForgeBenchOptions {
  /** What an assignee writes in its plot; one source file by default. */
  readonly leaves?: Leaves;
  /** territory.delivery; absent: the field is left out, which reads as manual. */
  readonly delivery?: Readonly<Record<string, unknown>>;
}

export interface ForgeBench {
  readonly kingdom: Bench;
  readonly repo: string;
  /** The bare repo `origin` names. */
  readonly remote: string;
  readonly forge: FakeForge;
  /** The forges a Steward gets unless told otherwise: the fake forge for github, git from the PATH. */
  readonly forges: Forges;
  /** A Steward over the bench's deps, `overrides` over them, started without its loop; remove() stops it. */
  start(overrides?: Partial<StewardDeps>, forges?: Forges | null): Promise<Steward>;
  lines(type: string): Promise<Event[]>;
  /** The tip of `branch` on the bare remote; '' when it has no such branch. */
  remoteTip(branch: string): string;
  /** Whether any file of the kingdom (the log, the journals, `.runs/`, the quests…) holds `text`. */
  holds(text: string): Promise<boolean>;
  remove(): Promise<void>;
}

const ROOMS: Leaves = () => ({ 'src/rooms.ts': 'export const rooms = [];\n' });

async function kingdomHolds(root: string, text: string): Promise<boolean> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries.filter((found) => found.isFile())) {
    if ((await readFile(path.join(entry.parentPath, entry.name), 'utf8')).includes(text)) return true;
  }
  return false;
}

export async function forgeBench(options: ForgeBenchOptions = {}): Promise<ForgeBench> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria forge repo '));
  const remote = await mkdtemp(path.join(os.tmpdir(), 'elvaria forge remote '));
  await gitRepoWith(repo, { 'README.md': '# dc1\n' });
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-q', 'origin', 'main');
  const kingdom = await bench();
  const vcs = { type: 'git', default_branch: 'main', remote: FORGE_REMOTE };
  await onRepo(kingdom, repo, [], {
    vcs,
    ...(options.delivery === undefined ? {} : { delivery: options.delivery }),
  });
  const forge = fakeForge();
  const forges: Forges = { adapters: { github: forge }, git: { file: 'git', args: [] } };
  const started: Steward[] = [];
  const base = {
    plots: gitPlots(kingdom.root),
    runners: leavingRunners(kingdom, options.leaves ?? ROOMS),
    env: childEnv(),
  };
  return {
    kingdom,
    repo,
    remote,
    forge,
    forges,
    start: async (overrides = {}, given = forges) => {
      const steward = kingdom.steward({
        ...base,
        ...(given === null ? {} : { forges: given }),
        ...overrides,
      });
      started.push(steward);
      const begun = await steward.start({ loop: false });
      if (!begun.ok) throw new Error(`fixture: the Steward did not start: ${begun.error}`);
      return steward;
    },
    lines: async (type) =>
      (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type),
    remoteTip: (branch) => git(remote, 'for-each-ref', '--format=%(objectname)', `refs/heads/${branch}`),
    holds: (text) => kingdomHolds(kingdom.root, text),
    remove: async () => {
      for (const steward of started) await steward.stop();
      await kingdom.remove();
      await Promise.all([rm(repo, RM_TEMP), rm(remote, RM_TEMP)]);
    },
  };
}
