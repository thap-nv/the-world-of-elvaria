// Plots.check and Plots.patrol of the check ledger's specs (RC-04, ADR 0035): nothing runs, every call is recorded
// with the checks it ran and those it carried, so a spec sees what the Steward asked of the ledger on real git trees.
import type { CheckRun } from '@elvaria/runner-core';
import type { TerritoryTrial } from '@elvaria/domain';

import type { Plots } from '../types.ts';

export interface LedgerCall {
  /** The run's folder: `.runs/<quest>-<n>` after a session, `.runs/<quest>-delivery` in the merge queue. */
  readonly run_dir: string;
  readonly ran: readonly string[];
  readonly carried: readonly string[];
}

/** Whether check `id` is red in this run of the checks, by its folder (`run_dir`). */
export type RedOf = (id: string, runDir: string) => boolean;

const step = (id: string, pass: boolean) => ({
  command: `node ${id}.mjs`,
  pass,
  duration_ms: pass ? 40 : 60,
  timed_out: false,
  exit_code: pass ? 0 : 1,
  log_path: `.runs/ledger/${id}.log`,
});

/** Plots.check: each check of the territory passes unless `red` says, a carried one in no time, naming its line. */
export function ledgerCheck(red: RedOf = () => false): { calls: LedgerCall[]; check: Plots['check'] } {
  const calls: LedgerCall[] = [];
  const check: Plots['check'] = ({ territory, run_dir: runDir, carried = [] }) => {
    const from = new Map<string, CheckRun['carried_from']>(carried.map(({ id, from: line }) => [id, line]));
    const runs = territory.checks.map(({ id }): CheckRun => {
      const line = from.get(id);
      if (line !== undefined) return { ...step(id, true), id, duration_ms: 0, carried_from: line };
      return { ...step(id, !red(id, runDir)), id };
    });
    const ran = territory.checks.map(({ id }) => id as string).filter((id) => !from.has(id));
    calls.push({ run_dir: runDir, ran, carried: [...from.keys()] });
    return Promise.resolve(runs);
  };
  return { calls, check };
}

type Patrol = NonNullable<Plots['patrol']>;

export interface PatrolCall {
  readonly commit: string | undefined;
  readonly ran: readonly string[];
  readonly carried: readonly string[];
}

/** Plots.patrol: a green trial of the commit it is given (else `head()`), a carried check in no time. */
export function ledgerPatrol(head: () => string): { calls: PatrolCall[]; patrol: Patrol } {
  const calls: PatrolCall[] = [];
  const patrol: Patrol = (territory, { commit, carried = [] }) => {
    const from = new Map(carried.map(({ id, from: line }) => [id as string, line]));
    const checks = territory.checks.map(({ id, timeout_minutes: minutes }) => {
      const line = from.get(id);
      const ran = { ...step(id, true), id, timeout_minutes: minutes };
      return line === undefined ? ran : { ...ran, duration_ms: 0, carried_from: line };
    });
    const ran = checks.filter(({ id }) => !from.has(id)).map(({ id }) => id as string);
    calls.push({ commit, ran, carried: [...from.keys()] });
    const trial: TerritoryTrial = { base: commit ?? head(), setup: null, checks };
    return Promise.resolve(trial);
  };
  return { calls, patrol };
}
