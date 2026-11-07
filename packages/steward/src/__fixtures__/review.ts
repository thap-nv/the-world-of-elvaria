// What the review specs share: plots whose answers a spec replaces, a failing check, and how to wait for a quest.
import { folderPlots } from '../plots.ts';
import type { Plots } from '../types.ts';
import type { Bench } from './kingdom.ts';
import type { Quest, VerdictId } from '@elvaria/domain';
import type { CheckRun } from '@elvaria/runner-core';

export const statusIs = (kingdom: Bench, title: string, status: Quest['status']) => async () =>
  (await kingdom.quest(title)).status === status;

export const verdictIn = async (kingdom: Bench, id: string) => {
  const read = await kingdom.store.verdicts.read(id as VerdictId);
  if (!read.ok) throw new Error(`no verdict ${id}`);
  return read.value;
};

/** The unit check of run 1 of `quest`, failed. */
export const unitFails = (quest: string): CheckRun => ({
  id: 'unit' as CheckRun['id'],
  pass: false,
  duration_ms: 900,
  log_path: `.runs/${quest}-1/checks/unit.log`,
  exit_code: 1,
  timed_out: false,
});

/** The quest id inside a run folder `.runs/<quest>-1`. */
export const questOfRun = (runDir: string): string => runDir.slice('.runs/'.length, -'-1'.length);

/** folderPlots with some of its answers replaced, and every call to them kept. */
export function plotsWith(root: string, replace: Partial<Plots>, calls: string[] = []): Plots {
  const base = folderPlots(root);
  return {
    prepare: (quest, territory) => base.prepare(quest, territory),
    commit: (plot, message) => {
      calls.push(`commit ${message}`);
      return (replace.commit ?? base.commit)(plot, message);
    },
    check: (request) => {
      calls.push(`check ${request.run_dir}`);
      return (replace.check ?? base.check)(request);
    },
    release: (plot) => {
      calls.push(`release ${plot.type}`);
      return (replace.release ?? base.release)(plot);
    },
    scriptChecks: (territory) => (replace.scriptChecks ?? base.scriptChecks)(territory),
  };
}
