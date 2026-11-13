// Builders for the scorecard specs: a territory, a trial, and a ledger with the territory's rows and rates.
import { metricsOf } from '../../metrics/metrics-of.ts';
import { TerritorySchema } from '../../schema/territory.ts';
import type { Metrics, QuestMetrics } from '../../metrics/metrics-of.ts';
import type { PassRate } from '../../metrics/rates.ts';
import type { Territory } from '../../schema/territory.ts';
import type { TerritoryTrial, TrialCheck, TrialStep } from '../trial.ts';

export const BASE = '0123456789abcdef0123456789abcdef01234567';

/** A git territory with a setup and two checks, laws on paths declared, plus `fields`. */
export function territoryOf(fields: Record<string, unknown> = {}): Territory {
  return TerritorySchema.parse({
    version: 1,
    id: 'demo',
    name: 'Demo',
    path: 'D:/Dummy/Tool - Demo',
    kind: 'code',
    vcs: { type: 'git', default_branch: 'main' },
    commands: { setup: 'pnpm install --frozen-lockfile' },
    checks: [
      { id: 'lint', run: 'pnpm lint', when: ['**/*.ts'], timeout_minutes: 10 },
      { id: 'test', run: ['pnpm build', 'pnpm test'], when: ['src/**'], timeout_minutes: 30 },
    ],
    shared_paths: [{ glob: 'docs/glossary.md', merge: 'union' }],
    laws: { protected_paths: ['.github/**'] },
    ...fields,
  });
}

export const stepOf = (fields: Partial<TrialStep> = {}): TrialStep => ({
  command: 'pnpm install --frozen-lockfile',
  pass: true,
  duration_ms: 41_000,
  timed_out: false,
  exit_code: 0,
  log_path: '.runs/trial-demo-setup.log',
  ...fields,
});

export const checkOf = (id: string, fields: Partial<TrialCheck> = {}): TrialCheck => ({
  ...stepOf({ command: `pnpm ${id}`, duration_ms: 12_000, log_path: `.runs/trial-demo/checks/${id}.log` }),
  id,
  timeout_minutes: 10,
  ...fields,
});

/** A trial where the setup and both checks passed, plus `fields`. */
export const trialOf = (fields: Partial<TerritoryTrial> = {}): TerritoryTrial => ({
  base: BASE,
  setup: stepOf(),
  checks: [checkOf('lint'), checkOf('test', { timeout_minutes: 30 })],
  ...fields,
});

const EMPTY = metricsOf({ quests: [], verdicts: [], events: [], commands: [] });

/** A quest row of the ledger on `territory` with its runs of checks. */
export function rowOf(territory: string, checkRuns: number, setAside: number): QuestMetrics {
  return {
    id: `q_20261113_${String(checkRuns)}${String(setAside)}aaaa` as QuestMetrics['id'],
    kind: 'build' as QuestMetrics['kind'],
    territory: territory as QuestMetrics['territory'],
    tier: 'session',
    class: null,
    status: 'done',
    entries: 2,
    tokens: 0,
    rework: { infra: 0, output: 0, question: 0, unknown: 0 },
    first_pass: null,
    owner_commands: 0,
    check_runs: checkRuns,
    checks_set_aside: setAside,
  };
}

/** The ledger with these quest rows and first-pass rates by territory. */
export const ledgerOf = (rows: readonly QuestMetrics[], byTerritory: readonly PassRate[] = []): Metrics => ({
  ...EMPTY,
  quests: rows,
  first_pass: { ...EMPTY.first_pass, by_territory: byTerritory },
});

/** A ledger where the territory `demo` measures well on both rates. */
export const GOOD_LEDGER = ledgerOf(
  [rowOf('demo', 10, 0), rowOf('other', 5, 5)],
  [
    { key: 'demo', decided: 4, passed: 3 },
    { key: 'other', decided: 4, passed: 0 },
  ],
);

/** A gazetteer that names every command of territoryOf(). */
export const GOOD_GAZETTEER = [
  '# Demo',
  'Install with `pnpm install`; lint with `pnpm lint`; test with `pnpm build` then `pnpm test`.',
].join('\n');
