// What the party specs share (P1-18): dc1-se-team on a real git repo with PlotManager, FakeRunners whose assignees
// leave files in their plot, the drafts of a contract's list, and the quests to wait for.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import type { Quest } from '@elvaria/domain';
import type { SpawnRequest } from '@elvaria/runner-core';

import { leavingRunners } from './deliver.ts';
import { templated } from './template.ts';
import { gitPlots, gitRepoWith, onRepo } from './git-plots.ts';
import { CAST, RM_TEMP, bench, questPayload } from './kingdom.ts';
import type { Plots, Steward } from '../types.ts';
import type { Bench, CastMember, Plays } from './kingdom.ts';

export const CONTRACT = 'api/openapi.yaml';

/**
 * A part of the quest-draft schema: a knight's build on dc1-se-team under the contract, in the quest template and with
 * a scope of its own (PS-06: the subquests check returns parts without them).
 */
export const part = (ref: string, title: string, fields: Record<string, unknown> = {}) => ({
  ref,
  title,
  description: templated(`Part ${ref} of the party, against ${CONTRACT}.`),
  kind: 'build',
  rank: 'D',
  territory: 'dc1-se-team',
  tier: 'session',
  class_required: 'knight',
  tags: ['backend'],
  party_role: 'part',
  contract: CONTRACT,
  scope_paths: [`src/${ref}/**`],
  depends_on_refs: [],
  estimate: { tokens: 60000, minutes: 20 },
  seal_required: false,
  secrets_required: [],
  ...fields,
});

export const list = (...drafts: readonly unknown[]) => JSON.stringify({ version: 1, drafts });

/** The contract quest of the owner's Chancellor: a mage's plan heading a party. */
export const contractPayload = (title: string) =>
  questPayload(title, {
    kind: 'plan',
    class_required: 'mage',
    tags: ['backend'],
    party_role: 'contract',
    seal_required: false,
  });

/**
 * What each assignee leaves in its plot, by the quest's title; `merge` for the merge quest and `acceptance` for the
 * blind trial's acceptance part (both carry the contract's title).
 */
export type Files = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** More of the bench (P1-21): fields of the territory (its blind_trial), more characters. */
export interface BenchMore {
  readonly territory?: Readonly<Record<string, unknown>>;
  readonly cast?: readonly CastMember[];
  /** Plots to put over the git ones (P1-55): given them, the answers to replace. */
  readonly plots?: (plots: Plots) => Partial<Plots>;
}

/** The key of `Files` a session's quest leaves. */
const leftBy = (quest: Quest | undefined): string =>
  quest?.party_role === 'merge' || quest?.party_role === 'acceptance'
    ? quest.party_role
    : (quest?.title ?? '');

export interface PartyBench {
  readonly kingdom: Bench;
  readonly steward: Steward;
  readonly repo: string;
  /** [run_dir, party_role] of every territory check the Steward asked for. */
  readonly roles: readonly (readonly [string, string | undefined])[];
  remove(): Promise<void>;
}

/**
 * dc1-se-team on a fresh git repo, with `mages` mages (a returned plan goes back to its own mage first) and the
 * sessions' `plays` (verdicts by quest title: the merge quest shares the contract's).
 */
export async function partyBench(
  files: Files,
  mages = 1,
  plays: Plays = {},
  more: BenchMore = {},
): Promise<PartyBench> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria party repo '));
  await gitRepoWith(repo, { 'README.md': '# dc1\n' });
  const cast = ['merle', 'morgan', 'mirel', 'mott'].slice(0, mages).map((id) => ({ id, cls: 'mage' }));
  const kingdom = await bench({ cast: [...CAST, ...cast, ...(more.cast ?? [])], plays });
  await onRepo(kingdom, repo, [], more.territory);
  const leaves = (req: SpawnRequest) => files[leftBy(req.quest)] ?? {};
  const plots = gitPlots(kingdom.root);
  const roles: [string, string | undefined][] = [];
  // The territory's checks run nothing here; what they are asked for is kept.
  const check: Plots['check'] = (request) => {
    roles.push([request.run_dir, request.party_role]);
    return plots.check(request);
  };
  // A quest judged in a scratch plot (P1-20: a build tagged e2e, a blind trial's merge quest) runs them there.
  const trial: Plots['trial'] = (request) => {
    roles.push([request.run_dir, request.party_role]);
    return plots.trial(request);
  };
  const steward = kingdom.steward({
    plots: { ...plots, check, trial, ...more.plots?.(plots) },
    runners: leavingRunners(kingdom, leaves),
  });
  const started = await steward.start({ loop: false });
  if (!started.ok) throw new Error(`fixture: the Steward did not start: ${started.error}`);
  return {
    kingdom,
    steward,
    repo,
    roles,
    remove: async () => {
      await steward.stop();
      await kingdom.remove();
      await rm(repo, RM_TEMP);
    },
  };
}

export const worktreeOf = (quest: Quest): string => fromPortable(quest.plot.path ?? '');

export async function mergeOf(kingdom: Bench): Promise<Quest> {
  const merge = (await kingdom.quests()).find(({ party_role: role }) => role === 'merge');
  if (merge === undefined) throw new Error('fixture: no merge quest');
  return merge;
}

/** True once the quest `find` gives is in `status`; false while it is not there yet. */
export const reached =
  (find: () => Promise<Quest>, status: Quest['status']) => async (): Promise<boolean> => {
    try {
      return (await find()).status === status;
    } catch {
      return false;
    }
  };
