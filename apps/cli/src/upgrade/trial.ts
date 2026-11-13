// Trying a new build before the pointer moves (implementation-plan §3.16.4, ADR 0026; PS-04b), all 0 mana, on a
// copy of this kingdom's settings (mirror.ts), so nothing of the kingdom is written yet: the new build's `migrate`,
// then its `doctor`, then its conformance suite for each enabled tribe against the fake CLI the build carries for
// that adapter (`tribe check --scenarios --tool`, which writes nothing); last, one script-tier quest on a throwaway
// kingdom. Each runs as the new build's own command; the first that fails stops the trial.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Tribe, UpgradeStep } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { BUILT_IN_ADAPTERS } from '../run/crew.ts';
import { buildCli } from './build-cli.ts';
import { outputOf, reasonOf } from './build.ts';
import { mirrorKingdom } from './mirror.ts';
import { scriptTrial } from './script-trial.ts';
import type { CliIo } from '../io.ts';
import type { BuildCli } from './build-cli.ts';
import type { StepFailure, Tools } from './build.ts';

const MIGRATE_MINUTES = 5;
const DOCTOR_MINUTES = 5;
const SUITE_MINUTES = 10;
const MIRROR_PREFIX = 'elvaria upgrade mirror ';
const RM_TEMP = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;

/**
 * The fake CLI each built-in adapter's specs play the suite with, inside the build (its package's AdapterTool, PS-23). An adapter not named here (an
 * owner adapter file) has none to try, so its tribe is left to `elvaria tribe check` with its own CLI.
 */
function fakeCliOf(adapter: string): readonly string[] | undefined {
  const entry = BUILT_IN_ADAPTERS[adapter];
  const fake = entry?.tool.fake_cli;
  return entry === undefined || fake === undefined
    ? undefined
    : ['packages', entry.package, ...fake.split('/')];
}

export interface TrialPlace {
  readonly build: string;
  readonly kingdom: string;
  readonly tribes: readonly Tribe[];
}

export interface TrialFailure extends StepFailure {
  readonly step: UpgradeStep;
}

/** What the trial says as it goes: one line per step, and the reason a step failed. */
export interface TrialReport {
  readonly t: Translate;
  readonly out: (line: string) => void;
}

export type Trial = (place: TrialPlace, report: TrialReport) => Promise<TrialFailure | undefined>;

async function step(
  report: TrialReport,
  label: string,
  run: () => Promise<StepFailure | undefined>,
): Promise<StepFailure | undefined> {
  const failure = await run();
  report.out(
    failure === undefined
      ? report.t('cli.upgrade.step_passed', { step: label })
      : report.t('cli.upgrade.step_failed', { step: label, reason: failure.reason }),
  );
  return failure;
}

const asFailure = (outcome: Awaited<ReturnType<BuildCli>>): StepFailure | undefined =>
  outcome.code === 0 ? undefined : { reason: reasonOf(outcome), output: outputOf(outcome) };

async function conformance(
  place: TrialPlace,
  cli: BuildCli,
  mirror: string,
  report: TrialReport,
): Promise<StepFailure | undefined> {
  for (const tribe of place.tribes.filter(({ enabled }) => enabled)) {
    const fake = fakeCliOf(tribe.adapter);
    if (fake === undefined) {
      report.out(report.t('cli.upgrade.no_fake', { tribe: tribe.id, adapter: tribe.adapter }));
      continue;
    }
    const label = report.t('cli.upgrade.step.conformance', { tribe: tribe.id });
    const tool = ['--tool', path.join(place.build, ...fake)];
    const args = ['tribe', 'check', tribe.id, '--scenarios', ...tool, '--kingdom', mirror];
    const failure = await step(report, label, async () => asFailure(await cli(args, SUITE_MINUTES)));
    if (failure !== undefined) return failure;
  }
  return undefined;
}

/** migrate, doctor and the suites of the new build, on the mirror; the step that failed, if one did. */
async function onMirror(
  place: TrialPlace,
  io: CliIo,
  mirror: string,
  report: TrialReport,
): Promise<TrialFailure | undefined> {
  const cli = buildCli(place.build, io);
  const at = ['--kingdom', mirror];
  const migrated = await step(report, report.t('cli.upgrade.step.migrate'), async () =>
    asFailure(await cli(['migrate', ...at], MIGRATE_MINUTES)),
  );
  if (migrated !== undefined) return { step: 'migrate', ...migrated };
  const doctor = await step(report, report.t('cli.upgrade.step.doctor'), async () =>
    asFailure(await cli(['doctor', ...at], DOCTOR_MINUTES)),
  );
  if (doctor !== undefined) return { step: 'doctor', ...doctor };
  const suite = await conformance(place, cli, mirror, report);
  return suite === undefined ? undefined : { step: 'conformance', ...suite };
}

/** The trial of `elvaria upgrade`; tests give the upgrade a trial of their own. */
export function buildTrial(tools: Tools, io: CliIo): Trial {
  return async (place, report) => {
    const dir = await mkdtemp(path.join(tmpdir(), MIRROR_PREFIX));
    try {
      const mirror = path.join(dir, 'kingdom');
      await mirrorKingdom(place.kingdom, mirror);
      const failure = await onMirror(place, io, mirror, report);
      if (failure !== undefined) return failure;
    } finally {
      await rm(dir, RM_TEMP).catch(() => undefined);
    }
    const quest = await step(report, report.t('cli.upgrade.step.trial'), () =>
      scriptTrial(tools, io, place.build),
    );
    return quest === undefined ? undefined : { step: 'trial', ...quest };
  };
}
