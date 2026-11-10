// What the delivery specs share: plots that look like git worktrees (a folder per quest under the territory's
// repo, a `quest/<id>` branch, no git), runners whose assignees leave files in their plot, a territory moved to
// a real folder, and the delivery note of a quest.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema, ok } from '@elvaria/domain';
import { inKingdom, toPortable } from '@elvaria/store';
import type { Quest, TerritoryId } from '@elvaria/domain';
import type { AgentRunner, SpawnRequest } from '@elvaria/runner-core';

import type { Plots } from '../types.ts';
import type { Bench } from './kingdom.ts';

/** `<repo>/.elvaria/worktrees/<quest>` on branch `quest/<quest>`: what PlotManager gives, without git. */
export function worktreePlots(repo: string): Plots {
  return {
    prepare: async (quest) => {
      const cwd = path.join(repo, '.elvaria', 'worktrees', quest.id);
      await mkdir(cwd, { recursive: true });
      return { plot: { type: 'worktree', path: toPortable(cwd), branch: `quest/${quest.id}` }, cwd };
    },
    commit: () => Promise.resolve({ status: 'committed', sha: 'f00d' }),
    applyPatch: () => Promise.resolve({ status: 'none' }),
    check: () => Promise.resolve([]),
    head: () => Promise.resolve(null),
    // No git, so no scratch plot either: a judge of tests as the product works in the quest's own folder.
    trial: () => Promise.resolve([]),
    scratch: (quest) => {
      const cwd = path.join(repo, '.elvaria', 'worktrees', quest.id);
      return Promise.resolve({ plot: { type: 'worktree', path: toPortable(cwd) }, cwd });
    },
    releaseScratch: () => Promise.resolve(undefined),
    scriptChecks: () => Promise.resolve([]),
    diff: () => Promise.resolve(''),
    merge: () => Promise.resolve({ merged: [], pending: [] }),
    unmerged: () => Promise.resolve([]),
    release: () => Promise.resolve(ok({ removed: true, forget_failures: [] })),
  };
}

/** Files an assignee writes in its plot, by the quest's title: path relative to the plot → text. */
export type Leaves = (req: SpawnRequest) => Readonly<Record<string, string>>;

async function leave(req: SpawnRequest, leaves: Leaves): Promise<void> {
  for (const [file, text] of Object.entries(leaves(req))) {
    const target = path.join(req.cwd, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  }
}

/** The bench's runners, their assignees writing `leaves` in the plot before the session plays. */
export function leavingRunners(kingdom: Bench, leaves: Leaves): Record<'claude' | 'gemini', AgentRunner> {
  const wrap = (runner: AgentRunner): AgentRunner => ({
    ...runner,
    spawn: async (req) => {
      if (req.role === 'assignee') await leave(req, leaves);
      return runner.spawn(req);
    },
  });
  return { claude: wrap(kingdom.runners.claude), gemini: wrap(kingdom.runners.gemini) };
}

/** Moves a bench territory to `folder` (portable), with git settings when given. */
export async function moveTerritory(
  kingdom: Bench,
  id: string,
  folder: string,
  vcs: { readonly type: 'git' | 'none'; readonly default_branch?: string; readonly remote?: string } = {
    type: 'none',
  },
): Promise<void> {
  const read = await kingdom.store.territories.read(id as TerritoryId);
  if (!read.ok) throw new Error(`fixture: no territory ${id}`);
  const written = await kingdom.store.territories.write(
    TerritorySchema.parse({ ...read.value, path: toPortable(folder), vcs }),
  );
  if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
}

/** The delivery note the quest's `deliverable.path` names. */
export async function noteOf(kingdom: Bench, quest: Quest): Promise<string> {
  const note = quest.deliverable.path;
  if (note === undefined) throw new Error(`fixture: ${quest.id} has no delivery note`);
  return readFile(inKingdom(kingdom.root, note), 'utf8');
}

export const delivered = (kingdom: Bench, title: string) => async (): Promise<boolean> =>
  (await kingdom.quest(title)).deliverable.delivered_at !== undefined;
